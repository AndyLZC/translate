import { browser } from 'wxt/browser';
import { normalizeSettings, type Settings } from './settings';

/**
 * 设置备份到浏览器的同步存储（Chrome 账号 / Firefox Sync）。
 * 卸载后 local 存储会被清空，sync 存储会保留并跟扩展 ID 绑定；
 * 扩展 ID 已在 manifest 里固定，所以重新安装后能自动恢复，包括 API Key。
 *
 * sync 每项最多 8KB，所以把 JSON 按字节切块存放。
 */
const META = 'backup:meta';
const CHUNK = (i: number) => `backup:${i}`;
/** 每块 JSON 序列化后的字节上限（留出键名和余量） */
const MAX_CHUNK_BYTES = 7000;

interface Meta {
  chunks: number;
  updatedAt: number;
  version: 1;
}

const bytes = (s: string) => new TextEncoder().encode(JSON.stringify(s)).length;

/** 按 UTF-8 字节切块，不切断多字节字符 */
export function splitByBytes(text: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let lo = start + 1;
    let hi = text.length;
    // 二分找出不超过上限的最长片段
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (bytes(text.slice(start, mid)) <= maxBytes) lo = mid;
      else hi = mid - 1;
    }
    // 避免切在代理对中间
    if (lo < text.length && /[\uD800-\uDBFF]/.test(text[lo - 1])) lo--;
    chunks.push(text.slice(start, lo));
    start = lo;
  }
  return chunks.length ? chunks : [''];
}

export async function writeBackup(settings: Settings) {
  const chunks = splitByBytes(JSON.stringify(settings));
  const old = (await browser.storage.sync.get(META))[META] as Meta | undefined;
  const items: Record<string, unknown> = { [META]: { chunks: chunks.length, updatedAt: Date.now(), version: 1 } satisfies Meta };
  chunks.forEach((c, i) => (items[CHUNK(i)] = c));
  await browser.storage.sync.set(items);
  if (old && old.chunks > chunks.length) {
    await browser.storage.sync.remove(Array.from({ length: old.chunks - chunks.length }, (_, i) => CHUNK(chunks.length + i)));
  }
}

export async function readBackup(): Promise<{ settings: Settings; updatedAt: number } | null> {
  const meta = (await browser.storage.sync.get(META))[META] as Meta | undefined;
  if (!meta?.chunks) return null;
  const keys = Array.from({ length: meta.chunks }, (_, i) => CHUNK(i));
  const data = await browser.storage.sync.get(keys);
  if (keys.some((k) => typeof data[k] !== 'string')) return null;
  try {
    return { settings: normalizeSettings(JSON.parse(keys.map((k) => data[k]).join(''))), updatedAt: meta.updatedAt };
  } catch {
    return null;
  }
}

export async function clearBackup() {
  const meta = (await browser.storage.sync.get(META))[META] as Meta | undefined;
  const keys = [META, ...Array.from({ length: meta?.chunks ?? 0 }, (_, i) => CHUNK(i))];
  await browser.storage.sync.remove(keys);
}

/** 导出为文件时可选择去掉 API Key */
export function exportSettings(settings: Settings, includeKeys: boolean) {
  const copy = structuredClone(settings);
  if (!includeKeys) for (const p of Object.values(copy.providers)) p.apiKey = '';
  return JSON.stringify({ app: 'ai-translate', version: 1, exportedAt: new Date().toISOString(), settings: copy }, null, 2);
}

/** 导入文件；文件里没有 Key 的服务商保留当前的 Key */
export function importSettings(json: string, current: Settings): Settings {
  const data = JSON.parse(json);
  const raw = data?.app === 'ai-translate' ? data.settings : data;
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的设置文件');
  const next = normalizeSettings(raw);
  for (const [type, cfg] of Object.entries(next.providers)) {
    if (!cfg.apiKey) cfg.apiKey = current.providers[type as keyof Settings['providers']].apiKey;
  }
  return next;
}
