/**
 * 极简 Markdown 渲染：【小节】、### 小标题、"- " 列表（可缩进一层）、> 意群切分、| 表格 |、**加粗**。
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

/** 「> a | b | c」：按意群切开的原句，每个意群一块，中间用细竖线隔开 */
function chunks(text: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'chunks';
  text.split(/\s*[|｜]\s*/).filter(Boolean).forEach((part, i) => {
    if (i) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '/';
      box.append(' ', sep, ' ');
    }
    const span = document.createElement('span');
    span.className = 'chunk';
    span.textContent = part.replace(/\*\*/g, '');
    box.append(span);
  });
  return box;
}

/** 「| a | b |」表格：第一行是表头，「| --- |」分隔行跳过；单元格内容照常分层 */
function table(rows: string[]): HTMLTableElement {
  const t = document.createElement('table');
  const cells = (row: string) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
  body.forEach((row, i) => {
    const tr = document.createElement('tr');
    for (const c of cells(row)) {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      cell.append(i === 0 ? c.replace(/\*\*/g, '') : lineContent(c));
      tr.append(cell);
    }
    (i === 0 ? (t.createTHead()) : (t.tBodies[0] ?? t.createTBody())).append(tr);
  });
  return t;
}

export function renderMarkdown(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  /** 当前所在的列表层级：[0] 顶层，[1] 缩进的子列表 */
  let lists: HTMLUListElement[] = [];
  let rows: string[] = [];
  const flushTable = () => {
    if (rows.length) frag.append(table(rows));
    rows = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      lists = [];
      rows.push(line);
      continue;
    }
    flushTable();
    if (!line) {
      lists = [];
      continue;
    }
    const quote = line.match(/^(?:[-*•]\s+)?>\s*(.+)$/);
    if (quote) {
      lists = [];
      frag.append(chunks(quote[1]));
      continue;
    }
    const sec = line.match(/^【([^】]{1,12})】\s*(.*)$/);
    const sub = line.match(/^#{2,6}\s+(.+)$/);
    const item = line.match(/^(?:[-*•]|\d+[.、])\s+(.*)$/);
    if (sec) {
      lists = [];
      const h4 = document.createElement('h4');
      h4.textContent = sec[1];
      frag.append(h4);
      if (sec[2]) {
        const p = document.createElement('p');
        p.append(lineContent(sec[2]));
        frag.append(p);
      }
    } else if (sub) {
      // 「### 第二句（重点）」这类小标题
      lists = [];
      const h5 = document.createElement('h5');
      h5.append(inline(sub[1]));
      frag.append(h5);
    } else if (item) {
      const nested = /^\s{2,}|^\t/.test(raw) && lists.length > 0;
      const li = document.createElement('li');
      li.append(lineContent(item[1]));
      if (nested) {
        if (!lists[1]) {
          lists[1] = document.createElement('ul');
          (lists[0].lastElementChild ?? lists[0]).append(lists[1]);
        }
        lists[1].append(li);
      } else {
        if (!lists[0]) {
          lists[0] = document.createElement('ul');
          frag.append(lists[0]);
        }
        lists.length = 1;
        lists[0].append(li);
      }
    } else {
      lists = [];
      const p = document.createElement('p');
      p.append(lineContent(line.replace(/^#+\s*/, '')));
      frag.append(p);
    }
  }
  flushTable();
  return frag;
}
