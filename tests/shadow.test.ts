import { describe, expect, it } from 'vitest';
import { Extractor } from '@/content/extractor';
import { composedContains, findShadowRoots, shadowCss } from '@/content/shadow';
import { renderMarkdown } from '@/content/ui/markdown';

describe('Shadow DOM（评论区组件）', () => {
  it('找到嵌套的 shadow root，并能从里面提取段落', () => {
    document.body.innerHTML = '<p>Light text here.</p><div id="host"></div>';
    const outer = document.getElementById('host')!.attachShadow({ mode: 'open' });
    outer.innerHTML = '<p>Great comment about the economy.</p><div id="inner"></div>';
    const inner = (outer.getElementById('inner') as HTMLElement).attachShadow({ mode: 'open' });
    inner.innerHTML = '<p>A nested reply to that comment.</p>';

    const roots = findShadowRoots(document.body);
    expect(roots).toEqual([outer, inner]);
    expect(composedContains(document.body, inner.firstChild!)).toBe(true);

    const ex = new Extractor({ targetLang: 'zh-CN', excludeSelector: '', blockSelector: '' });
    expect(ex.extract(outer).map((u) => u.source.text)).toEqual(['Great comment about the economy.']);
    expect(ex.extract(inner).map((u) => u.source.text)).toEqual(['A nested reply to that comment.']);
  });

  it('宿主在不翻译的区域里时跳过', () => {
    document.body.innerHTML = '<nav><div id="host"></div></nav>';
    const sr = document.getElementById('host')!.attachShadow({ mode: 'open' });
    sr.innerHTML = '<p>Menu entries that should stay.</p>';
    const ex = new Extractor({ targetLang: 'zh-CN', excludeSelector: 'nav', blockSelector: '' });
    expect(ex.extract(sr)).toEqual([]);
  });

  it('html[data-tx-…] 选择器改写成 :host(…)', () => {
    expect(shadowCss("html[data-tx-mode='original'] tx-translation { display: none }")).toBe(":host([data-tx-mode='original']) tx-translation { display: none }");
    expect(shadowCss("html[data-tx-learn][data-tx-mode='bilingual'] tx-learn {}")).toBe(":host([data-tx-learn][data-tx-mode='bilingual']) tx-learn {}");
  });
});

describe('解析渲染', () => {
  it('「> a | b」渲染成按意群切开的原句', () => {
    const box = document.createElement('div');
    box.append(renderMarkdown('【句子拆解】\n> Since May 2025, | consumer sentiment has risen | for people\n**主干**：sentiment has risen'));
    const chunks = [...box.querySelectorAll('.chunks .chunk')].map((e) => e.textContent);
    expect(chunks).toEqual(['Since May 2025,', 'consumer sentiment has risen', 'for people']);
    expect(box.querySelectorAll('.chunks .sep')).toHaveLength(2);
    expect(box.querySelector('strong')?.textContent).toBe('主干');
  });
});
