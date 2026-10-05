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
