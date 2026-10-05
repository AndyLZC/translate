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
    [...(prompt ?? "").matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)]
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

describe('translateText', () => {
  it('划词：普通句子直接翻译，单词走词典格式，结果缓存', async () => {
    const complete = vi.fn<CompleteFn>(async ({ system, prompt }) => ({
      text: system.includes('dictionary') ? `${prompt} /ˈæp.əl/\nn. 苹果` : `译:${prompt}`,
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    const usage: unknown[] = [];
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache(), onUsage: (u) => usage.push(u) });
    expect(await svc.translateText({ text: ' Hello world ', mode: 'selection' })).toEqual({ text: '译:Hello world', dictionary: false });
    expect(await svc.translateText({ text: 'apple', mode: 'selection' })).toEqual({ text: 'apple /ˈæp.əl/\nn. 苹果', dictionary: true });
    await svc.translateText({ text: 'apple', mode: 'selection' });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(usage).toEqual([
      { model: 'openai/gpt-4o-mini', chars: 11, usage: { inputTokens: 10, outputTokens: 5 } },
      { model: 'openai/gpt-4o-mini', chars: 5, usage: { inputTokens: 10, outputTokens: 5 } },
    ]);
  });

  it('输入框翻译：按指定语言，提示词说明是自己写的消息', async () => {
    const complete = vi.fn<CompleteFn>(async () => 'Hi there');
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache() });
    expect(await svc.translateText({ text: '你好', mode: 'input', to: 'en' })).toEqual({ text: 'Hi there', dictionary: false });
    const { system } = complete.mock.calls[0][0];
    expect(system).toContain('into English');
    expect(system).toContain('chat box');
  });

  it('出错时返回错误信息', async () => {
    const complete = vi.fn<CompleteFn>(async () => {
      throw Object.assign(new Error('x'), { statusCode: 429 });
    });
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache() });
    expect(await svc.translateText({ text: 'hi there', mode: 'selection' })).toEqual({ error: '请求太频繁或额度用完（429）' });
  });
});

describe('学习模式', () => {
  it('解析结果缓存；追问带上原文、解析和历史', async () => {
    const complete = vi.fn<CompleteFn>(async ({ messages, prompt }) => (messages ? `答:${messages.at(-1)!.content}` : `【译文】${prompt}`));
    const svc = new TranslationService({ getSettings: async () => settings, complete, cache: memoryCache() });
    expect(await svc.analyze({ text: 'Soil matters.' })).toEqual({ text: '【译文】Soil matters.' });
    await svc.analyze({ text: 'Soil matters.' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].system).toContain('【句子结构】');

    const res = await svc.followUp({
      text: 'Soil matters.',
      analysis: '【译文】土壤很重要。',
      history: [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
      ],
      question: 'matters 是什么词性？',
    });
    expect(res).toEqual({ text: '答:matters 是什么词性？' });
    expect(complete.mock.calls[1][0].messages!.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });
});

describe('交互请求单独排队', () => {
  it('整页翻译占满并发时，解析不用排队等待', async () => {
    let releasePage!: () => void;
    const pageGate = new Promise<void>((r) => (releasePage = r));
    const complete = vi.fn<CompleteFn>(async ({ prompt, system }) => {
      if (system.includes('【句子结构】')) return '【句子结构】ok';
      await pageGate; // 整页翻译的请求一直卡着
      return (prompt ?? '').replace(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g, '<seg id="$1">译</seg>');
    });
    const svc = new TranslationService({ getSettings: async () => ({ ...settings, concurrency: 1, batchSize: 1 }), complete, cache: memoryCache() });
    const page = svc.translate({ texts: ['a', 'b', 'c'] });
    const analysis = await Promise.race([
      svc.analyze({ text: 'Soil matters a lot.' }),
      new Promise((r) => setTimeout(() => r('timeout'), 500)),
    ]);
    expect(analysis).toEqual({ text: '【句子结构】ok' });
    releasePage();
    await page;
  });

  it('流式解析：逐段回调，命中缓存时一次给出全文', async () => {
    const deltas: string[] = [];
    const svc = new TranslationService({
      getSettings: async () => settings,
      complete: vi.fn<CompleteFn>(),
      stream: async (_args, onDelta) => {
        for (const p of ['【句子', '结构】', 'ok']) onDelta(p);
        return { text: '【句子结构】ok' };
      },
      cache: memoryCache(),
    });
    expect(await svc.analyzeStream({ text: 'x y', translation: '译' }, (d) => deltas.push(d))).toEqual({ text: '【句子结构】ok' });
    expect(deltas).toEqual(['【句子', '结构】', 'ok']);
    const again: string[] = [];
    await svc.analyzeStream({ text: 'x y', translation: '译' }, (d) => again.push(d));
    expect(again).toEqual(['【句子结构】ok']);
  });
});
