import { dayKey, type UsageData, type UsageEntry } from '@/background/usage';
import { costOf, type CostOptions, type ModelPrice } from './pricing';

export interface Totals extends UsageEntry {
  /** 有价格的部分的费用 */
  cost: number;
  /** 有用量但没有价格的模型 */
  unpriced: string[];
}

const empty = (): Totals => ({ requests: 0, inputTokens: 0, outputTokens: 0, chars: 0, cost: 0, unpriced: [] });

export function summarize(data: UsageData, days: string[], prices: Record<string, ModelPrice>, opts: CostOptions): Totals {
  const t = empty();
  for (const d of days) {
    for (const [model, e] of Object.entries(data[d] ?? {})) {
      t.requests += e.requests;
      t.inputTokens += e.inputTokens;
      t.outputTokens += e.outputTokens;
      t.chars += e.chars;
      const c = costOf(model, e, prices, opts);
      if (c == null) {
        if (!t.unpriced.includes(model)) t.unpriced.push(model);
      } else t.cost += c;
    }
  }
  return t;
}

export function monthDays(data: UsageData, now = new Date()) {
  const prefix = dayKey(now).slice(0, 7);
  return Object.keys(data).filter((d) => d.startsWith(prefix));
}

/** 1,284 / 12.9K / 1.2M */
export function compact(n: number) {
  if (n < 10_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
