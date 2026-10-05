import PQueue from 'p-queue';
import type {
  AnalyzeRequest,
  ChatTurn,
  FollowUpRequest,
  TranslateRequest,
  TranslateResponse,
  TranslateTextRequest,
  TranslateTextResponse,
} from '@/lib/messaging';
import type { Settings } from '@/lib/settings';
import {
  buildAnalysisInput,
  buildAnalysisPrompt,
  buildDictionaryPrompt,
  buildFollowUpPrompt,
  buildSystemPrompt,
  buildTextPrompt,
  buildUserPrompt,
  isSingleWord,
  parseSegments,
  PROMPT_VERSION,
} from './prompt';

export interface CacheLike {
  getMany(keys: string[]): Promise<(string | undefined)[]>;
  putMany(entries: { key: string; text: string }[]): Promise<void>;
  hashKey(parts: (string | number)[]): Promise<string>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** 真正调用模型的函数，测试时可替换 */
export type CompleteFn = (args: {
  system: string;
  prompt?: string;
  messages?: ChatTurn[];
  settings: Settings;
}) => Promise<string | { text: string; usage?: Usage }>;

/** 流式调用模型：边生成边回调 */
export type StreamFn = (
  args: { system: string; prompt?: string; messages?: ChatTurn[]; settings: Settings; signal?: AbortSignal },
  onDelta: (text: string) => void,
) => Promise<{ text: string; usage?: Usage }>;

export interface ServiceDeps {
  getSettings(): Promise<Settings>;
  complete: CompleteFn;
  /** 不提供时退回一次性调用（测试用） */
  stream?: StreamFn;
  cache: CacheLike;
  /** 每次真正请求模型后回调，用于用量统计 */
  onUsage?(info: { model: string; chars: number; usage?: Usage }): void;
}

/**
 * 所有标签页共用：一个请求队列（并发 + 限流）和一份缓存。
 * 流程：查缓存 → 去重 → 按段数/字符数打包 → 排队请求 → 漏掉的段落单独补翻 → 写缓存。
 */
export class TranslationService {
  private queue: PQueue | undefined;
  private queueKey = '';
  /** 解析、追问、划词等用户正在等的请求，单独一个队列，不排在整页翻译后面 */
  private interactiveQueue: PQueue | undefined;
  private interactiveKey = '';
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

  /** 调模型并记录用量 */
  private async call(system: string, input: string | ChatTurn[], settings: Settings): Promise<string> {
    const res = await this.deps.complete(
      typeof input === 'string' ? { system, prompt: input, settings } : { system, messages: input, settings },
    );
    const out = typeof res === 'string' ? { text: res } : res;
    const p = settings.providers[settings.activeProvider];
    const chars = typeof input === 'string' ? input.length : input.reduce((n, m) => n + m.content.length, 0);
    this.deps.onUsage?.({ model: `${settings.activeProvider}/${p.model}`, chars, usage: out.usage });
    return out.text;
  }

  /** 学习模式：句子解析（一次性返回） */
  async analyze(req: AnalyzeRequest, configError?: (s: Settings) => string | null): Promise<{ text?: string; error?: string }> {
    let text = '';
    const res = await this.analyzeStream(req, (t) => (text += t), configError);
    return res.error ? res : { text: res.text ?? text };
  }

  /** 学习模式：追问（一次性返回） */
  async followUp(req: FollowUpRequest, configError?: (s: Settings) => string | null): Promise<{ text?: string; error?: string }> {
    return this.followUpStream(req, () => {}, configError);
  }

  /** 单段文字：划词、查词、输入框翻译 */
  async translateText(
    req: TranslateTextRequest,
    configError?: (s: Settings) => string | null,
  ): Promise<TranslateTextResponse> {
    const settings = await this.deps.getSettings();
    const err = configError?.(settings);
    if (err) return { error: err };
    const text = req.text.trim();
    if (!text) return { text: '' };

    const to = req.to || settings.targetLang;
    const dictionary = req.mode === 'selection' && isSingleWord(text);
    const system = dictionary ? buildDictionaryPrompt(to) : buildTextPrompt(settings, to, req.mode);
    const provider = settings.providers[settings.activeProvider];
    const key = await this.deps.cache.hashKey([
      PROMPT_VERSION,
      'text',
      settings.activeProvider,
      provider.baseURL,
      provider.model,
      to,
      await this.deps.cache.hashKey([system]),
      text,
    ]);
    const [cached] = await this.deps.cache.getMany([key]);
    if (cached != null) return { text: cached, dictionary };

    try {
      const out = (await this.getInteractiveQueue(settings).add(() => this.call(system, text, settings)))!.trim();
      if (out) await this.deps.cache.putMany([{ key, text: out }]);
      return { text: out, dictionary };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }

  private getInteractiveQueue(s: Settings) {
    const key = `${s.requestsPerMinute}`;
    if (!this.interactiveQueue || key !== this.interactiveKey) {
      this.interactiveKey = key;
      this.interactiveQueue = new PQueue({
        concurrency: 3,
        ...(s.requestsPerMinute > 0 ? { intervalCap: s.requestsPerMinute, interval: 60_000 } : {}),
      });
    }
    return this.interactiveQueue;
  }

  /** 流式调用；没有流式实现时一次性返回 */
  private async callStream(
    system: string,
    input: string | ChatTurn[],
    settings: Settings,
    onDelta: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.deps.stream) {
      const text = await this.call(system, input, settings);
      onDelta(text);
      return text;
    }
    const args = typeof input === 'string' ? { system, prompt: input, settings, signal } : { system, messages: input, settings, signal };
    const out = await this.deps.stream(args, onDelta);
    const p = settings.providers[settings.activeProvider];
    const chars = typeof input === 'string' ? input.length : input.reduce((n, m) => n + m.content.length, 0);
    this.deps.onUsage?.({ model: `${settings.activeProvider}/${p.model}`, chars, usage: out.usage });
    return out.text;
  }

  /** 解析（流式）：命中缓存时一次性返回全文 */
  async analyzeStream(
    req: AnalyzeRequest,
    onDelta: (t: string) => void,
    configError?: (s: Settings) => string | null,
    signal?: AbortSignal,
  ): Promise<{ text?: string; error?: string }> {
    const settings = await this.deps.getSettings();
    const err = configError?.(settings);
    if (err) return { error: err };
    const text = req.text.trim();
    const translation = req.translation?.trim() || undefined;
    const system = buildAnalysisPrompt(settings.targetLang, !!translation);
    const key = await this.analysisKey(settings, system, text);
    const [cached] = await this.deps.cache.getMany([key]);
    if (cached != null) {
      onDelta(cached);
      return { text: cached };
    }
    try {
      const out = (
        await this.getInteractiveQueue(settings).add(() => this.callStream(system, buildAnalysisInput(text, translation), settings, onDelta, signal))
      )!.trim();
      if (out) await this.deps.cache.putMany([{ key, text: out }]);
      return { text: out };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }

  /** 追问（流式，不缓存） */
  async followUpStream(
    req: FollowUpRequest,
    onDelta: (t: string) => void,
    configError?: (s: Settings) => string | null,
    signal?: AbortSignal,
  ): Promise<{ text?: string; error?: string }> {
    const settings = await this.deps.getSettings();
    const err = configError?.(settings);
    if (err) return { error: err };
    try {
      const out = await this.getInteractiveQueue(settings).add(() =>
        this.callStream(buildFollowUpPrompt(settings.targetLang), followUpMessages(req), settings, onDelta, signal),
      );
      return { text: out!.trim() };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }

  private async analysisKey(settings: Settings, system: string, text: string) {
    const provider = settings.providers[settings.activeProvider];
    return this.deps.cache.hashKey([
      PROMPT_VERSION,
      'analyze',
      settings.activeProvider,
      provider.baseURL,
      provider.model,
      await this.deps.cache.hashKey([system]),
      text,
    ]);
  }

  async translate(req: TranslateRequest, configError?: (s: Settings) => string | null): Promise<TranslateResponse> {
    const settings = await this.deps.getSettings();
    const err = configError?.(settings);
    if (err) return { translations: req.texts.map(() => null), error: err };

    const system = buildSystemPrompt(settings);
    const sysHash = await this.deps.cache.hashKey([system]);
    const provider = settings.providers[settings.activeProvider];
    const keyOf = (text: string) =>
      this.deps.cache.hashKey([
        PROMPT_VERSION,
        settings.activeProvider,
        provider.baseURL,
        provider.model,
        settings.targetLang,
        sysHash,
        text,
      ]);

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
      const job = this.run(todo, settings, system, req.context, req.kind ?? 'page').then((r) => {
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
    kind: 'page' | 'subtitle',
  ): Promise<{ done: Map<string, string>; error?: string }> {
    const queue = this.getQueue(s);
    const done = new Map<string, string>();
    let error: string | undefined;

    /** 返回 false 表示请求本身失败（网络、鉴权、限流），这种情况不再逐段重试，避免放大故障 */
    const runChunk = async (chunk: { key: string; text: string }[]): Promise<boolean> => {
      try {
        const output = await this.call(
          system,
          buildUserPrompt(
            chunk.map((c) => c.text),
            context,
            kind,
          ),
          s,
        );
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
    // 字幕每句很短，大批次能给模型更多上下文，也更省 token
    const chunks =
      kind === 'subtitle' ? chunkTexts(todo, SUBTITLE_BATCH_SIZE, SUBTITLE_BATCH_CHARS) : chunkTexts(todo, s.batchSize, s.batchChars);
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
const SUBTITLE_BATCH_SIZE = 40;
const SUBTITLE_BATCH_CHARS = 6000;

function followUpMessages(req: FollowUpRequest): ChatTurn[] {
  return [
    { role: 'user', content: buildAnalysisInput(req.text) },
    { role: 'assistant', content: req.analysis },
    ...req.history.slice(-10),
    { role: 'user', content: req.question },
  ];
}

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
    // AI SDK 的错误带 statusCode，Anthropic SDK 的错误带 status
    const err = e as { statusCode?: number; status?: number; message?: string; name?: string };
    const status = err.statusCode ?? err.status;
    if (status === 401) return 'API Key 无效（401）';
    if (status === 403) return '没有权限使用这个模型（403）';
    if (status === 404) return '接口地址或模型名称不对（404）';
    if (status === 429) return '请求太频繁或额度用完（429）';
    if (status === 529 || status === 503) return '模型服务繁忙，请稍后重试';
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return '请求超时';
    if (err.message) return err.message;
  }
  return String(e);
}
