import { browser } from 'wxt/browser';

/** 每天、每个「服务商/模型」的用量；只保留最近 60 天 */
export interface UsageEntry {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** 发送的原文字符数 */
  chars: number;
}
export type UsageData = Record<string, Record<string, UsageEntry>>;

export const USAGE_KEY = 'usage';
const KEEP_DAYS = 60;

export function dayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addUsage(data: UsageData, day: string, model: string, add: UsageEntry): UsageData {
  const days = { ...data };
  const entry = { ...(days[day]?.[model] ?? { requests: 0, inputTokens: 0, outputTokens: 0, chars: 0 }) };
  entry.requests += add.requests;
  entry.inputTokens += add.inputTokens;
  entry.outputTokens += add.outputTokens;
  entry.chars += add.chars;
  days[day] = { ...days[day], [model]: entry };
  for (const k of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[k];
  return days;
}

/** 在内存里累计，几秒写一次，避免每个请求都写存储 */
export class UsageRecorder {
  private pending = new Map<string, UsageEntry>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  record(model: string, add: UsageEntry) {
    const cur = this.pending.get(model) ?? { requests: 0, inputTokens: 0, outputTokens: 0, chars: 0 };
    this.pending.set(model, {
      requests: cur.requests + add.requests,
      inputTokens: cur.inputTokens + add.inputTokens,
      outputTokens: cur.outputTokens + add.outputTokens,
      chars: cur.chars + add.chars,
    });
    this.timer ??= setTimeout(() => void this.flush(), 3000);
  }

  async flush() {
    this.timer = undefined;
    if (!this.pending.size) return;
    const pending = this.pending;
    this.pending = new Map();
    const day = dayKey();
    let data = ((await browser.storage.local.get(USAGE_KEY))[USAGE_KEY] as UsageData | undefined) ?? {};
    for (const [model, add] of pending) data = addUsage(data, day, model, add);
    await browser.storage.local.set({ [USAGE_KEY]: data });
  }
}
