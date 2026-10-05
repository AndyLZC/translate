import { describe, expect, it } from 'vitest';
import { addUsage, dayKey } from '@/background/usage';
import { isSingleWord } from '@/background/prompt';

describe('usage', () => {
  it('按天按模型累计，只保留最近 60 天', () => {
    let data = {};
    data = addUsage(data, '2026-10-05', 'deepseek/deepseek-chat', { requests: 1, inputTokens: 100, outputTokens: 50, chars: 300 });
    data = addUsage(data, '2026-10-05', 'deepseek/deepseek-chat', { requests: 2, inputTokens: 10, outputTokens: 5, chars: 30 });
    expect(data).toEqual({ '2026-10-05': { 'deepseek/deepseek-chat': { requests: 3, inputTokens: 110, outputTokens: 55, chars: 330 } } });
    for (let i = 1; i <= 70; i++) data = addUsage(data, `2027-01-${String(i).padStart(3, '0')}`, 'm', { requests: 1, inputTokens: 0, outputTokens: 0, chars: 0 });
    expect(Object.keys(data)).toHaveLength(60);
    expect(dayKey(new Date(2026, 9, 5))).toBe('2026-10-05');
  });
});

describe('isSingleWord', () => {
  it('识别单词', () => {
    expect(isSingleWord('serendipity')).toBe(true);
    expect(isSingleWord("don't")).toBe(true);
    expect(isSingleWord('苹果')).toBe(true);
    expect(isSingleWord('hello world')).toBe(false);
    expect(isSingleWord('42')).toBe(false);
    expect(isSingleWord('这是一个很长的句子')).toBe(false);
  });
});
