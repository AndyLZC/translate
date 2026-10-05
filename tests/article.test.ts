import { describe, expect, it } from 'vitest';
import { countWords, extractArticle, readingMinutes } from '@/content/article';

describe('正文提取', () => {
  it('去掉插件插入的译文，太短的页面返回 null', () => {
    const para = 'Spending keeps growing faster than income while savings shrink across the country. ';
    document.title = 'News';
    document.body.innerHTML = `<article><h1>Headline</h1>${Array.from({ length: 6 }, () => `<p>${para.repeat(3)}<tx-translation>【译】不应出现</tx-translation></p>`).join('')}</article>`;
    const a = extractArticle()!;
    expect(a.text).toContain('Spending keeps growing');
    expect(a.text).not.toContain('不应出现');
    expect(a.truncated).toBe(false);
    document.body.innerHTML = '<p>Hi</p>';
    expect(extractArticle()).toBeNull();
  });

  it('词数和阅读时间：英文按词、中文按字', () => {
    expect(countWords("It's a well-known fact.")).toBe(4);
    expect(countWords('中文内容 and English')).toBe(6);
    expect(readingMinutes('word '.repeat(660))).toBe(3);
  });
});
