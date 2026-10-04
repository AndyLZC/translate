import { describe, expect, it, vi } from 'vitest';
import { chunkTexts, TranslationService, type CompleteFn } from '@/background/translation-service';
import { DEFAULT_SETTINGS } from '@/lib/settings';

function memoryCache() {
  const map = new Map<string, string>();
  return {
    map,
    getMany: async (keys: string[]) => keys.map((k) => map.get(k)),
    putMany: async (entries: { key: string; text: string }[]) => {
      entries.forEach((e) => map.set(e.key, e.text));
    },
    hashKey: async (parts: (string | number)[]) => parts.join('|'),
  };
}

/** 假模型：把每段原文变成 "译:原文"，可以故意漏掉某些段 */
function fakeModel(drop: (text: string) => boolean = () => false) {
  return vi.fn<CompleteFn>(async ({ prompt }) =>
    [...prompt.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)]
      .filter((m) => !drop(m[2]))
      .map((m) => `<seg id="${m[1]}">译:${m[2]}</seg>`)
      .join('\n'),
  );
}

const settings = {
  ...DEFAULT_SETTINGS,
  batchSize: 3,
  providers: { ...DEFAULT_SETTINGS.providers, openai: { apiKey: 'k', baseURL: '', model: 'gpt-4o-mini' } },
};

describe('TranslationService', () => {
  it('批量翻译、去重、写缓存，第二次直接命中缓存', async () => {
    const cache = memoryCache();
    const complete = fakeModel();
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache });
    const res = await svc.translate({ texts: ['a', 'b', 'a', 'c', 'd'] });
    expect(res).toEqual({ translations: ['译:a', '译:b', '译:a', '译:c', '译:d'] });
    // 4 段唯一原文，每批 3 段 → 2 个请求
    expect(complete).toHaveBeenCalledTimes(2);

    const again = await svc.translate({ texts: ['d', 'a'] });
    expect(again.translations).toEqual(['译:d', '译:a']);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('段数对不上时只把漏掉的段落单独重发', async () => {
    let first = true;
    const complete = fakeModel((t) => {
      if (t === 'b' && first) {
        first = false;
        return true;
      }
      return false;
    });
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache() });
    const res = await svc.translate({ texts: ['a', 'b', 'c'] });
    expect(res.translations).toEqual(['译:a', '译:b', '译:c']);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0].prompt).toContain('<seg id="1">b</seg>');
  });

  it('请求失败时返回 null 和错误信息，不缓存', async () => {
    const cache = memoryCache();
    const complete = vi.fn<CompleteFn>(async () => {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    });
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache });
    const res = await svc.translate({ texts: ['a', 'b'] });
    expect(res.translations).toEqual([null, null]);
    expect(res.error).toBe('API Key 无效（401）');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(cache.map.size).toBe(0);
  });

  it('配置不完整时不发请求', async () => {
    const complete = fakeModel();
    const svc = new TranslationService({ getSettings: async () => DEFAULT_SETTINGS, complete, cache: memoryCache() });
    const res = await svc.translate({ texts: ['a'] }, (s) => (s.providers[s.activeProvider].apiKey ? null : '缺 Key'));
    expect(res).toEqual({ translations: [null], error: '缺 Key' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('并发请求里相同的原文只翻一次', async () => {
    const complete = fakeModel();
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache() });
    const [a, b] = await Promise.all([svc.translate({ texts: ['x'] }), svc.translate({ texts: ['x'] })]);
    expect(a.translations).toEqual(['译:x']);
    expect(b.translations).toEqual(['译:x']);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('换服务商或模型后不复用旧缓存', async () => {
    const cache = memoryCache();
    const complete = fakeModel();
    let current = settings;
    const svc = new TranslationService({ getSettings: async () => current, complete, cache });
    await svc.translate({ texts: ['a'] });
    current = {
      ...settings,
      activeProvider: 'anthropic',
      providers: { ...settings.providers, anthropic: { apiKey: 'k', baseURL: '', model: 'claude-haiku-4-5' } },
    };
    await svc.translate({ texts: ['a'] });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('chunkTexts', () => {
  it('按段数和字符数切分，超长单段独占一批', () => {
    const items = ['aaaa', 'bb', 'cccccccccc', 'd'].map((text) => ({ text }));
    expect(chunkTexts(items, 3, 8).map((c) => c.map((i) => i.text))).toEqual([['aaaa', 'bb'], ['cccccccccc'], ['d']]);
  });
});
