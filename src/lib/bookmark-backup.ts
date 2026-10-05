import { browser } from 'wxt/browser';

/**
 * 把设置备份到一个浏览器书签里。
 * 卸载扩展时浏览器会清空扩展自己的所有存储（包括 storage.sync），但书签不受影响；
 * 登录浏览器账号时书签还会同步到其他电脑。重装后据此自动恢复，不用重新填 API Key。
 *
 * 内容用 AES-GCM 加密编码，书签管理器里看不到明文 Key。
 * 注意：密钥写在扩展代码里，这只是防止被一眼看到，不等于强加密。
 */
export const BACKUP_TITLE = 'AI 双语翻译 · 设置备份（请勿删除）';
const URL_PREFIX = 'https://ai-translate.invalid/backup#';
const FORMAT = 'v1';

/** 书签读写的最小接口，便于测试替换 */
export interface BookmarkStore {
  find(): Promise<{ id: string; url: string } | null>;
  create(url: string): Promise<void>;
  update(id: string, url: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const browserBookmarks: BookmarkStore | null = browser.bookmarks
  ? {
      async find() {
        const hits = await browser.bookmarks.search({ query: 'ai-translate.invalid/backup' });
        const hit = hits.find((b) => b.url?.startsWith(URL_PREFIX));
        return hit ? { id: hit.id, url: hit.url! } : null;
      },
      async create(url) {
        await browser.bookmarks.create({ title: BACKUP_TITLE, url });
      },
      async update(id, url) {
        await browser.bookmarks.update(id, { title: BACKUP_TITLE, url });
      },
      async remove(id) {
        await browser.bookmarks.remove(id);
      },
    }
  : null; // 手机版 Firefox 没有书签 API

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  keyPromise ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode('ai-translate/settings-backup/v1'))
    .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyPromise;
}

export async function encodeBackup(json: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(json)));
  return `${URL_PREFIX}${FORMAT}.${b64url(iv)}.${b64url(ct)}`;
}

export async function decodeBackup(url: string): Promise<string | null> {
  if (!url.startsWith(URL_PREFIX)) return null;
  const [format, iv, ct] = url.slice(URL_PREFIX.length).split('.');
  if (format !== FORMAT || !iv || !ct) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await key(), fromB64url(ct));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function writeBookmarkBackup(json: string, store = browserBookmarks) {
  if (!store) return false;
  const url = await encodeBackup(json);
  const existing = await store.find();
  if (existing) await store.update(existing.id, url);
  else await store.create(url);
  return true;
}

export async function readBookmarkBackup(store = browserBookmarks): Promise<string | null> {
  if (!store) return null;
  const existing = await store.find();
  return existing ? decodeBackup(existing.url) : null;
}

export async function clearBookmarkBackup(store = browserBookmarks) {
  const existing = await store?.find();
  if (existing) await store!.remove(existing.id);
}
