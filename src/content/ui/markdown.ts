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
      frag.append(p.replace(/\*\*/g, ''));
    }
  });
  return frag;
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
        p.append(inline(sec[2]));
        frag.append(p);
      }
    } else if (item) {
      if (!list) {
        list = document.createElement('ul');
        frag.append(list);
      }
      const li = document.createElement('li');
      li.append(inline(item[1]));
      list.append(li);
    } else {
      list = null;
      const p = document.createElement('p');
      p.append(inline(line.replace(/^#+\s*/, '')));
      frag.append(p);
    }
  }
  return frag;
}
