import Dexie, { type EntityTable } from 'dexie';

interface CachedTranslation {
  key: string;
  text: string;
  ts: number;
}

const MAX_ENTRIES = 100_000;

class TranslationDB extends Dexie {
  translations!: EntityTable<CachedTranslation, 'key'>;
  constructor() {
    super('ai-translate');
    this.version(1).stores({ translations: 'key, ts' });
  }
}

const db = new TranslationDB();
let writesSincePrune = 0;

export async function hashKey(parts: (string | number)[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join('\u0000'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getMany(keys: string[]): Promise<(string | undefined)[]> {
  try {
    const rows = await db.translations.bulkGet(keys);
    return rows.map((r) => r?.text);
  } catch (e) {
    console.warn('[ai-translate] 读取缓存失败', e);
    return keys.map(() => undefined);
  }
}

export async function putMany(entries: { key: string; text: string }[]) {
  if (!entries.length) return;
  const ts = Date.now();
  try {
    await db.translations.bulkPut(entries.map((e) => ({ ...e, ts })));
    writesSincePrune += entries.length;
    if (writesSincePrune > 2000) {
      writesSincePrune = 0;
      await prune();
    }
  } catch (e) {
    console.warn('[ai-translate] 写入缓存失败', e);
  }
}

/** 超过上限时删掉最旧的 20% */
async function prune() {
  const count = await db.translations.count();
  if (count <= MAX_ENTRIES) return;
  const keys = await db.translations.orderBy('ts').limit(Math.ceil(count * 0.2)).primaryKeys();
  await db.translations.bulkDelete(keys);
}

export async function count() {
  return db.translations.count();
}

export async function clear() {
  const n = await db.translations.count();
  await db.translations.clear();
  return n;
}
