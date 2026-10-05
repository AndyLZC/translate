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
    box.append(renderMarkdown('【逐句拆解】\n> Since May 2025, | consumer sentiment has risen | for people\n**主干**：sentiment has risen'));
    const chunks = [...box.querySelectorAll('.chunks .chunk')].map((e) => e.textContent);
    expect(chunks).toEqual(['Since May 2025,', 'consumer sentiment has risen', 'for people']);
    expect(box.querySelectorAll('.chunks .sep')).toHaveLength(2);
    expect(box.querySelector('strong')?.textContent).toBe('主干');
  });
});

describe('解析渲染：完整格式', () => {
  it('小标题、缩进子列表、表格', () => {
    const box = document.createElement('div');
    box.append(
      renderMarkdown(
        [
          '【逐句拆解】',
          '### 第二句（重点）',
          '逐块看：',
          "- those who don't own any：",
          '  - those = those people',
          '  - any 后面省略了 stocks',
          '- while：表对比',
          '【重点词汇和搭配】',
          '| 词 / 搭配 | 意思 |',
          '| --- | --- |',
          '| stretch /stretʃ/ n. | 一段时间 |',
          '| rosy outlook | 乐观的预期 |',
        ].join('\n'),
      ),
    );
    expect(box.querySelector('h5')?.textContent).toBe('第二句（重点）');
    const top = box.querySelector('ul')!;
    expect(top.children).toHaveLength(2);
    expect(top.children[0].querySelectorAll('ul > li')).toHaveLength(2);
    expect([...box.querySelectorAll('th')].map((e) => e.textContent)).toEqual(['词 / 搭配', '意思']);
    expect(box.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(box.querySelector('tbody .phon')?.textContent).toBe('/stretʃ/');
  });
});
