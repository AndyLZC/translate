import PQueue from 'p-queue';
import type { TranslateRequest, TranslateResponse } from '@/lib/messaging';
import type { Settings } from '@/lib/settings';
import { buildSystemPrompt, buildUserPrompt, parseSegments, PROMPT_VERSION } from './prompt';

export interface CacheLike {
  getMany(keys: string[]): Promise<(string | undefined)[]>;
  putMany(entries: { key: string; text: string }[]): Promise<void>;
  hashKey(parts: (string | number)[]): Promise<string>;
}

/** 真正调用模型的函数，测试时可替换 */
export type CompleteFn = (args: { system: string; prompt: string; settings: Settings }) => Promise<string>;

export interface ServiceDeps {
  getSettings(): Promise<Settings>;
  complete: CompleteFn;
  cache: CacheLike;
}

/**
 * 所有标签页共用：一个请求队列（并发 + 限流）和一份缓存。
 * 流程：查缓存 → 去重 → 按段数/字符数打包 → 排队请求 → 漏掉的段落单独补翻 → 写缓存。
 */
export class TranslationService {
  private queue: PQueue | undefined;
  private queueKey = '';
  /** 正在翻译中的同一段原文，后来的请求直接等它的结果 */
  private inflight = new Map<string, Promise<string | null>>();

  constructor(private deps: ServiceDeps) {}

  private getQueue(s: Settings) {
    const key = `${s.concurrency}|${s.requestsPerMinute}`;
    if (!this.queue || key !== this.queueKey) {
      this.queueKey = key;
      this.queue = new PQueue({
        concurrency: Math.max(1, s.concurrency),
        ...(s.requestsPerMinute > 0 ? { intervalCap: s.requestsPerMinute, interval: 60_000 } : {}),
      });
    }
    return this.queue;
  }

  async translate(req: TranslateRequest, configError?: (s: Settings) => string | null): Promise<TranslateResponse> {
    const settings = await this.deps.getSettings();
    const err = configError?.(settings);
    if (err) return { translations: req.texts.map(() => null), error: err };

    const system = buildSystemPrompt(settings);
    const sysHash = await this.deps.cache.hashKey([system]);
    const keyOf = (text: string) =>
      this.deps.cache.hashKey([PROMPT_VERSION, settings.baseURL, settings.model, settings.targetLang, sysHash, text]);

    const keys = await Promise.all(req.texts.map(keyOf));
    const cached = await this.deps.cache.getMany(keys);
    const results: (string | null)[] = cached.map((c) => c ?? null);

    // 需要翻译的唯一原文（同一批里重复的段落只翻一次；别的标签页正在翻的直接等）
    const waiting = new Map<string, Promise<string | null>>();
    const todo: { key: string; text: string }[] = [];
    req.texts.forEach((text, i) => {
      if (results[i] != null || waiting.has(keys[i])) return;
      const running = this.inflight.get(keys[i]);
      if (running) {
        waiting.set(keys[i], running);
        return;
      }
      todo.push({ key: keys[i], text });
    });

    let lastError = '';
    if (todo.length) {
      const job = this.run(todo, settings, system, req.context).then((r) => {
        if (r.error) lastError = r.error;
        return r.done;
      });
      for (const t of todo) {
        const p = job.then((m) => m.get(t.key) ?? null).catch(() => null);
        this.inflight.set(t.key, p);
        waiting.set(t.key, p);
        void p.finally(() => this.inflight.delete(t.key));
      }
    }

    const resolved = new Map<string, string | null>();
    await Promise.all([...waiting].map(async ([k, p]) => resolved.set(k, await p)));
    keys.forEach((k, i) => {
      if (results[i] == null) results[i] = resolved.get(k) ?? null;
    });

    const failed = results.some((r) => r == null);
    return { translations: results, ...(failed ? { error: lastError || '翻译失败，请重试' } : {}) };
  }

  private async run(
    todo: { key: string; text: string }[],
    s: Settings,
    system: string,
    context: TranslateRequest['context'],
  ): Promise<{ done: Map<string, string>; error?: string }> {
    const queue = this.getQueue(s);
    const done = new Map<string, string>();
    let error: string | undefined;

    /** 返回 false 表示请求本身失败（网络、鉴权、限流），这种情况不再逐段重试，避免放大故障 */
    const runChunk = async (chunk: { key: string; text: string }[]): Promise<boolean> => {
      try {
        const output = await this.deps.complete({
          system,
          prompt: buildUserPrompt(
            chunk.map((c) => c.text),
            context,
          ),
          settings: s,
        });
        const parsed = parseSegments(output, chunk.length);
        chunk.forEach((c, i) => {
          const t = parsed.get(i + 1);
          if (t) done.set(c.key, t);
        });
        if (parsed.size < chunk.length) error ??= '模型返回的段落数对不上';
        return true;
      } catch (e) {
        error = errorMessage(e);
        return false;
      }
    };

    // 第一轮：打包翻译
    const chunks = chunkTexts(todo, s.batchSize, s.batchChars);
    const ok = await Promise.all(chunks.map((c) => queue.add(() => runChunk(c))));

    // 第二轮：请求成功但段数对不上的批次，只把漏掉的段落逐段重发一次
    const retry = chunks
      .filter((c, i) => ok[i] && c.length > 1)
      .flat()
      .filter((t) => !done.has(t.key))
      .slice(0, MAX_SINGLE_RETRIES);
    if (retry.length) await Promise.all(retry.map((t) => queue.add(() => runChunk([t]))));

    await this.deps.cache.putMany([...done].map(([key, text]) => ({ key, text })));
    return { done, error: done.size < todo.length ? error : undefined };
  }
}

const MAX_SINGLE_RETRIES = 20;

export function chunkTexts<T extends { text: string }>(items: T[], maxCount: number, maxChars: number): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= maxCount || chars + it.text.length > maxChars)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += it.text.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { statusCode?: number; message?: string; responseBody?: string };
    if (anyE.statusCode === 401) return 'API Key 无效（401）';
    if (anyE.statusCode === 404) return '接口地址或模型名称不对（404）';
    if (anyE.statusCode === 429) return '请求太频繁或额度用完（429）';
    if (anyE.message) return anyE.message;
  }
  return String(e);
}
