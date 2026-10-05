import { describe, expect, it, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearBackup, exportSettings, importSettings, readBackup, splitByBytes, writeBackup } from '@/lib/backup';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/lib/settings';

const withKey = normalizeSettings({
  activeProvider: 'deepseek',
  providers: { deepseek: { apiKey: 'sk-deep', baseURL: '', model: 'deepseek-chat' }, anthropic: { apiKey: 'sk-ant', baseURL: '', model: 'claude-haiku-4-5' } },
  glossary: '智能体=Agent\n'.repeat(2000),
} as never);

describe('backup', () => {
  beforeEach(() => fakeBrowser.reset());

  it('按字节切块，中文不超限且能拼回', () => {
    const text = '中文字符'.repeat(5000) + 'abc😀'.repeat(500);
    const chunks = splitByBytes(text, 7000);
    expect(chunks.join('')).toBe(text);
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(7000);
  });

  it('写入同步存储后能完整读回（含 API Key、大术语表）', async () => {
    await writeBackup(withKey);
    const back = await readBackup();
    expect(back?.settings).toEqual(withKey);
  });

  it('设置变小后清理多余的块；清除后读不到', async () => {
    await writeBackup(withKey);
    await writeBackup(DEFAULT_SETTINGS);
    const all = await fakeBrowser.storage.sync.get(null);
    expect(Object.keys(all).filter((k) => k.startsWith('backup:') && k !== 'backup:meta')).toHaveLength(1);
    await clearBackup();
    expect(await readBackup()).toBeNull();
  });

  it('导出可去掉 Key；导入时没有 Key 的服务商保留现有 Key', () => {
    const file = exportSettings(withKey, false);
    expect(file).not.toContain('sk-deep');
    const current = normalizeSettings({ providers: { deepseek: { apiKey: 'sk-current' } } } as never);
    const imported = importSettings(file, current);
    expect(imported.providers.deepseek.apiKey).toBe('sk-current');
    expect(imported.activeProvider).toBe('deepseek');
    expect(importSettings(exportSettings(withKey, true), current).providers.anthropic.apiKey).toBe('sk-ant');
    expect(() => importSettings('"x"', current)).toThrow();
  });
});

describe('书签备份', async () => {
  const { decodeBackup, encodeBackup } = await import('@/lib/bookmark-backup');
  const memoryBookmarks = () => {
    let item: { id: string; url: string } | null = null;
    return {
      get item() {
        return item;
      },
      find: async () => item,
      create: async (url: string) => void (item = { id: '1', url }),
      update: async (_id: string, url: string) => void (item = { id: '1', url }),
      remove: async () => void (item = null),
    };
  };

  it('加密编码：书签里看不到明文 Key，能解回原文', async () => {
    const url = await encodeBackup('{"apiKey":"sk-secret"}');
    expect(url.startsWith('https://ai-translate.invalid/backup#v1.')).toBe(true);
    expect(url).not.toContain('sk-secret');
    expect(await decodeBackup(url)).toBe('{"apiKey":"sk-secret"}');
    expect(await decodeBackup(url.slice(0, -4) + 'AAAA')).toBeNull();
  });

  it('优先从书签恢复；sync 被清空（卸载扩展）也能找回', async () => {
    fakeBrowser.reset();
    const store = memoryBookmarks();
    await writeBackup(withKey, store);
    await fakeBrowser.storage.sync.clear(); // 模拟卸载：浏览器清空扩展存储，书签保留
    const back = await readBackup(store);
    expect(back?.source).toBe('bookmark');
    expect(back?.settings.providers.deepseek.apiKey).toBe('sk-deep');
    expect(back?.settings.activeProvider).toBe('deepseek');
  });

  it('关闭备份时删除书签', async () => {
    const store = memoryBookmarks();
    await writeBackup(withKey, store);
    await clearBackup(store);
    expect(store.item).toBeNull();
  });
});
