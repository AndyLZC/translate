/**
 * 极简 Markdown 渲染：只支持 【小节】、"- " 列表、**加粗**。
 * 全部用 textContent 生成节点，模型输出里的 HTML 不会被执行。
 */
export interface Section {
  title: string;
  body: string;
}

/** 按 【标题】 切分；标题前的内容归入空标题 */
export function splitSections(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: '', body: '' };
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*【([^】]{1,12})】\s*(.*)$/);
    if (m) {
      if (cur.title || cur.body.trim()) out.push(cur);
      cur = { title: m[1], body: m[2] ? m[2] + '\n' : '' };
    } else {
      cur.body += line + '\n';
    }
  }
  if (cur.title || cur.body.trim()) out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

const CJK = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

/**
 * 给一段文字分层：音标 /…/、词性（n. v. adj. …）、夹在中文里的英文原文各用不同样式。
 * 中文解释保持默认（柔和）颜色，英文原文更亮，方便一眼找到在说哪几个词。
 */
const TOKEN =
  /(\/[^/㐀-鿿\n]{1,48}\/)|((?:^|(?<=[\s（(]))(?:n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|phr|aux|modal)\.(?=\s|$))|([A-Za-z][A-Za-z0-9'’\-]*(?:[ ,.;!?'’\-]+[A-Za-z0-9][A-Za-z0-9'’\-]*)*[.!?]?)/g;

function decorate(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) frag.append(text.slice(last, m.index));
    const span = document.createElement('span');
    span.className = m[1] ? 'phon' : m[2] ? 'pos' : 'en';
    span.textContent = m[0];
    frag.append(span);
    last = m.index! + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/** **标签** 加粗成主题色，其余文字分层 */
function inline(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const parts = text.split(/\*\*(.+?)\*\*/g);
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2) {
      const b = document.createElement('strong');
      b.textContent = p;
      frag.append(b);
    } else {
      frag.append(decorate(p.replace(/\*\*/g, '')));
    }
  });
  return frag;
}

/**
 * 「英文原文：中文解释」这种行：冒号前的英文作为重点（亮色、半粗），冒号后的解释正常分层。
 * 冒号前含中文或是 **标签** 的不拆。
 */
function lineContent(text: string): DocumentFragment {
  const m = text.match(/^([^：:*]{2,160}?)\s*[：:]\s*(.+)$/);
  if (m && LATIN.test(m[1]) && !CJK.test(m[1])) {
    const frag = document.createDocumentFragment();
    const term = document.createElement('span');
    term.className = 'term';
    term.textContent = m[1];
    frag.append(term, '：', inline(m[2]));
    return frag;
  }
  return inline(text);
}

export function renderMarkdown(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let list: HTMLUListElement | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const sec = line.match(/^【([^】]{1,12})】\s*(.*)$/);
    const item = line.match(/^(?:[-*•]|\d+[.、])\s+(.*)$/);
    if (sec) {
      list = null;
      const h4 = document.createElement('h4');
      h4.textContent = sec[1];
      frag.append(h4);
      if (sec[2]) {
        const p = document.createElement('p');
        p.append(lineContent(sec[2]));
        frag.append(p);
      }
    } else if (item) {
      if (!list) {
        list = document.createElement('ul');
        frag.append(list);
      }
      const li = document.createElement('li');
      li.append(lineContent(item[1]));
      list.append(li);
    } else {
      list = null;
      const p = document.createElement('p');
      p.append(lineContent(line.replace(/^#+\s*/, '')));
      frag.append(p);
    }
  }
  return frag;
}
