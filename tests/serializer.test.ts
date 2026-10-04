import { describe, expect, it } from 'vitest';
import { deserialize, serialize, stripPlaceholders } from '@/content/serializer';

function html(s: string) {
  const div = document.createElement('div');
  div.innerHTML = s;
  return div;
}

describe('serialize', () => {
  it('把行内格式转成编号占位符', () => {
    const p = html('Read the <a href="/docs">docs</a> and <b>star</b> it.<br>Thanks');
    const r = serialize([...p.childNodes]);
    expect(r.text).toBe('Read the <x0>docs</x0> and <x1>star</x1> it.<x2/>Thanks');
    expect(r.placeholders.map((x) => x.kind)).toEqual(['pair', 'pair', 'atom']);
    expect(r.plain).toBe('Read the docs and star it.\nThanks');
  });

  it('span 等无语义包装直接展开，code 作为原子', () => {
    const p = html('Call <span class="x">the <code>init()</code> function</span>');
    const r = serialize([...p.childNodes]);
    expect(r.text).toBe('Call the <x0/> function');
  });

  it('转义尖括号，合并空白', () => {
    const p = html('a &lt; b   &amp;&amp;\n  c &gt; d');
    expect(serialize([...p.childNodes]).text).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('站点规则排除的元素按原子处理', () => {
    const p = html('Posted by <span class="author">bob</span> today');
    const r = serialize([...p.childNodes], { isExcluded: (el) => el.classList.contains('author') });
    expect(r.text).toBe('Posted by <x0/> today');
  });
});

describe('deserialize', () => {
  const src = html('Read the <a href="/docs" id="l">docs</a> and <b>star</b> it.<br>Thanks');
  const { placeholders } = serialize([...src.childNodes]);

  it('还原链接和格式（链接仍可点击，去掉重复 id）', () => {
    const frag = deserialize('阅读<x0>文档</x0>并<x1>点星</x1>。<x2/>谢谢', placeholders)!;
    const box = document.createElement('div');
    box.appendChild(frag);
    expect(box.innerHTML).toBe('阅读<a href="/docs">文档</a>并<b>点星</b>。<br>谢谢');
  });

  it('允许模型调整占位符顺序', () => {
    const frag = deserialize('<x1>点星</x1>之前先读<x0>文档</x0>', placeholders)!;
    const box = document.createElement('div');
    box.appendChild(frag);
    expect(box.querySelector('a')!.textContent).toBe('文档');
  });

  it('标签交叉、未闭合或编号不存在时返回 null', () => {
    expect(deserialize('<x0>文档<x1>点星</x0></x1>', placeholders)).toBeNull();
    expect(deserialize('<x0>文档', placeholders)).toBeNull();
    expect(deserialize('<x9>文档</x9>', placeholders)).toBeNull();
    expect(deserialize('文档</x0>', placeholders)).toBeNull();
  });

  it('还原转义字符', () => {
    const box = document.createElement('div');
    box.appendChild(deserialize('a &lt; b &amp; c', [])!);
    expect(box.textContent).toBe('a < b & c');
  });

  it('stripPlaceholders 退回纯文本', () => {
    expect(stripPlaceholders('阅读<x0>文档</x0><x2/> &amp;')).toBe('阅读文档 &');
  });
});
