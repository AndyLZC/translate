import type { ProviderType } from './providers';

/** 每百万 token 的价格 */
export interface ModelPrice {
  input: number;
  output: number;
  currency: 'USD' | 'CNY';
}

export interface PriceInfo {
  price: ModelPrice | null;
  /** custom：用户填写；builtin：内置参考价；fallback：同服务商其他模型的价格估算；none：没有价格 */
  source: 'custom' | 'builtin' | 'fallback' | 'none';
  /** fallback 时借用的模型 */
  borrowed?: string;
}

/**
 * 内置参考价（每百万 token）。
 * - Claude：Anthropic 官方价格（2026-09）
 * - OpenAI、DeepSeek：官方公开价格，可能已调整，以官网为准；可在设置页修改
 * DeepSeek 按「缓存未命中」的输入价计算，实际有缓存命中时会更便宜。
 */
export const BUILTIN_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-4-5': { input: 1, output: 5, currency: 'USD' },
  'claude-sonnet-5-5': { input: 2, output: 10, currency: 'USD' },
  'claude-opus-5-5': { input: 4, output: 20, currency: 'USD' },
  'gpt-4o-mini': { input: 0.15, output: 0.6, currency: 'USD' },
  'gpt-4o': { input: 2.5, output: 10, currency: 'USD' },
  'gpt-4.1': { input: 2, output: 8, currency: 'USD' },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, currency: 'USD' },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, currency: 'USD' },
  'gpt-5-mini': { input: 0.25, output: 2, currency: 'USD' },
  'gpt-5-nano': { input: 0.05, output: 0.4, currency: 'USD' },
  'deepseek-chat': { input: 2, output: 3, currency: 'CNY' },
  'deepseek-reasoner': { input: 2, output: 3, currency: 'CNY' },
};

/** 同服务商下没有价格的模型，按这个模型的价格估算 */
const PROVIDER_FALLBACK: Partial<Record<ProviderType, string>> = {
  deepseek: 'deepseek-chat',
};

export const PRICING_PAGES: Partial<Record<ProviderType, string>> = {
  openai: 'https://openai.com/api/pricing/',
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  anthropic: 'https://www.anthropic.com/pricing',
};

export function priceFor(provider: string, model: string, custom: Record<string, ModelPrice> = {}): PriceInfo {
  if (custom[model]) return { price: custom[model], source: 'custom' };
  if (BUILTIN_PRICES[model]) return { price: BUILTIN_PRICES[model], source: 'builtin' };
  const borrowed = PROVIDER_FALLBACK[provider as ProviderType];
  if (borrowed) {
    const price = custom[borrowed] ?? BUILTIN_PRICES[borrowed];
    if (price) return { price, source: 'fallback', borrowed };
  }
  return { price: null, source: 'none' };
}

export interface CostOptions {
  currency: 'CNY' | 'USD';
  /** 1 美元兑多少人民币 */
  usdToCny: number;
}

export function convert(amount: number, from: 'USD' | 'CNY', opts: CostOptions) {
  if (from === opts.currency) return amount;
  return from === 'USD' ? amount * opts.usdToCny : amount / opts.usdToCny;
}

/** 某个「服务商/模型」的费用；没有价格时返回 null */
export function costOf(
  key: string,
  usage: { inputTokens: number; outputTokens: number },
  custom: Record<string, ModelPrice>,
  opts: CostOptions,
): number | null {
  const [provider, ...rest] = key.split('/');
  const { price } = priceFor(provider, rest.join('/'), custom);
  if (!price) return null;
  const raw = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return convert(raw, price.currency, opts);
}

export function formatMoney(amount: number, currency: 'CNY' | 'USD') {
  const sym = currency === 'CNY' ? '¥' : '$';
  if (amount === 0) return `${sym}0`;
  if (amount < 0.01) return `${sym}${amount.toFixed(4)}`;
  return `${sym}${amount.toFixed(amount < 1 ? 3 : 2)}`;
}
