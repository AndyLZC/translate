import { describe, expect, it } from 'vitest';
import { costOf, formatMoney, priceFor } from '@/lib/pricing';

const opts = { currency: 'CNY' as const, usdToCny: 7 };

describe('pricing', () => {
  it('内置价、用户自定义价、同服务商估算、没有价格', () => {
    expect(priceFor('anthropic', 'claude-haiku-4-5').source).toBe('builtin');
    expect(priceFor('deepseek', 'deepseek-flash')).toMatchObject({ source: 'fallback', borrowed: 'deepseek-chat' });
    expect(priceFor('deepseek', 'deepseek-flash', { 'deepseek-flash': { input: 1, output: 2, currency: 'CNY' } }).source).toBe('custom');
    expect(priceFor('custom', 'llama3').source).toBe('none');
  });

  it('按 token 计算并换算币种', () => {
    // DeepSeek：输入 ¥2/M，输出 ¥3/M
    expect(costOf('deepseek/deepseek-chat', { inputTokens: 1_000_000, outputTokens: 2_000_000 }, {}, opts)).toBeCloseTo(8);
    // Haiku：$1/M + $5/M，按 7 换算
    expect(costOf('anthropic/claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 }, {}, opts)).toBeCloseTo(42);
    expect(costOf('anthropic/claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 0 }, {}, { currency: 'USD', usdToCny: 7 })).toBeCloseTo(1);
    expect(costOf('custom/llama3', { inputTokens: 1, outputTokens: 1 }, {}, opts)).toBeNull();
  });

  it('金额格式', () => {
    expect(formatMoney(0.00321, 'CNY')).toBe('¥0.0032');
    expect(formatMoney(0.5, 'USD')).toBe('$0.500');
    expect(formatMoney(12.345, 'CNY')).toBe('¥12.35');
  });
});

describe('usage summary', async () => {
  const { summarize, compact, monthDays } = await import('@/lib/usage-summary');
  it('汇总费用并列出没有价格的模型', () => {
    const data = {
      '2026-10-04': { 'deepseek/deepseek-chat': { requests: 2, inputTokens: 1_000_000, outputTokens: 0, chars: 10 } },
      '2026-10-05': { 'custom/llama3': { requests: 1, inputTokens: 5, outputTokens: 5, chars: 1 } },
      '2026-09-30': { 'deepseek/deepseek-chat': { requests: 1, inputTokens: 0, outputTokens: 1_000_000, chars: 1 } },
    };
    const all = summarize(data, Object.keys(data), {}, opts);
    expect(all.cost).toBeCloseTo(5);
    expect(all.requests).toBe(4);
    expect(all.unpriced).toEqual(['custom/llama3']);
    expect(monthDays(data, new Date(2026, 9, 5)).sort()).toEqual(['2026-10-04', '2026-10-05']);
    expect([compact(1284), compact(12_900), compact(1_234_567)]).toEqual(['1,284', '12.9K', '1.2M']);
  });
});
