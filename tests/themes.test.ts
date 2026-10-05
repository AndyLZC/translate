import { describe, expect, it } from 'vitest';
import { contrast, THEMES } from '@/lib/themes';

/** 浅色背景：网页白底、设置页底色；深色背景：解析面板、设置页、常见深色网页 */
const LIGHT_BGS = ['#ffffff', '#f7f7fa'];
const DARK_BGS = ['#1e1f29', '#0f1015', '#16161a'];

describe('主题配色对比度（WCAG AA，正文 ≥ 4.5）', () => {
  for (const t of THEMES) {
    it(`${t.label}：按钮文字、浅色块文字、主题色文字都看得清`, () => {
      expect(contrast(t.light.primary, t.light.primaryFg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark.primary, t.dark.primaryFg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.light.accent, t.light.accentFg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark.accent, t.dark.accentFg)).toBeGreaterThanOrEqual(4.5);
      for (const bg of LIGHT_BGS) expect(contrast(t.light.link, bg)).toBeGreaterThanOrEqual(4.5);
      for (const bg of DARK_BGS) expect(contrast(t.dark.link, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('对比度计算正确（黑白 21:1）', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  });
});
