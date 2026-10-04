import { beforeEach, describe, expect, it } from 'vitest';
import { Extractor } from '@/content/extractor';
import { GLOBAL_EXCLUDE } from '@/lib/site-rules';

function setup(body: string, opts: { exclude?: string; blocks?: string } = {}) {
  document.body.innerHTML = body;
  const ex = new Extractor({
    targetLang: 'zh-CN',
    excludeSelector: [GLOBAL_EXCLUDE, opts.exclude].filter(Boolean).join(','),
    blockSelector: opts.blocks ?? '',
  });
  return { ex, units: ex.extract(document.body) };
}

const texts = (units: ReturnType<Extractor['extract']>) => units.filter((u) => u.state === 'pending').map((u) => u.source.text);

describe('Extractor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('普通段落整块作为一个单元，行内格式保留', () => {
    const { units } = setup('<article><h1>Hello world</h1><p>Some <a href="#">linked</a> text.</p></article>');
    expect(texts(units)).toEqual(['Hello world', 'Some <x0>linked</x0> text.']);
    expect(units.every((u) => u.whole)).toBe(true);
  });

  it('块里混着子块时，按连续行内内容分成多个单元', () => {
    const { units } = setup('<div>Intro text here <p>Inner paragraph</p> trailing words</div>');
    expect(texts(units)).toEqual(['Intro text here', 'Inner paragraph', 'trailing words']);
    expect(units.find((u) => u.source.text === 'Intro text here')!.whole).toBe(false);
  });

  it('跳过代码、已是中文的段落、纯数字和符号', () => {
    const { units } = setup('<p>Translate me</p><pre>const a = 1;</pre><p>这已经是中文了，不需要翻译。</p><p>12,345</p><p>—</p>');
    expect(texts(units)).toEqual(['Translate me']);
  });

  it('站点规则：exclude 不翻译、blocks 强制整段', () => {
    const { units } = setup(
      '<div class="tweet"><span>Hello </span><div>from</div><span> block</span></div><nav class="menu"><p>Home page</p></nav>',
      { exclude: '.menu', blocks: '.tweet' },
    );
    expect(texts(units)).toEqual(['Hello from block']);
  });

  it('隐藏元素不翻译', () => {
    const { units } = setup('<p>Visible text</p><p style="display:none">Hidden text</p>');
    expect(texts(units)).toEqual(['Visible text']);
  });

  it('重复扫描不会产生重复单元；原文变化后可识别为过期', () => {
    const { ex, units } = setup('<p id="p">Original text</p>');
    expect(ex.extract(document.body)).toHaveLength(0);
    const unit = units[0];
    expect(ex.isStale(unit)).toBe(false);
    document.getElementById('p')!.textContent = 'Changed text';
    expect(ex.isStale(unit)).toBe(true);
  });
});

describe('hasTranslatableText', async () => {
  const { hasTranslatableText } = await import('@/lib/language');
  it('跳过文件名、网址、用户名，保留普通单词', () => {
    expect(hasTranslatableText('wxt-demo.mp4')).toBe(false);
    expect(hasTranslatableText('https://example.com/a?b=1')).toBe(false);
    expect(hasTranslatableText('@octocat')).toBe(false);
    expect(hasTranslatableText('snake_case_name')).toBe(false);
    expect(hasTranslatableText('Demo')).toBe(true);
    expect(hasTranslatableText('e.g. this works')).toBe(true);
    expect(hasTranslatableText('12,345')).toBe(false);
  });
});
