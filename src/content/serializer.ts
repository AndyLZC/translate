/**
 * 行内格式占位符：把 <a>链接</a>、<b>加粗</b> 等转成 <x0>链接</x0> 交给模型，
 * 翻译回来再还原成原来的标签。模型把标签弄乱时返回 null，由调用方退回纯文本。
 */

/** 成对保留的行内标签：译文里还原后仍是链接、加粗等 */
const PAIR_TAGS = new Set([
  'A',
  'B',
  'STRONG',
  'EM',
  'I',
  'U',
  'S',
  'DEL',
  'INS',
  'MARK',
  'SUB',
  'SUP',
  'SMALL',
  'ABBR',
  'CITE',
  'Q',
  'DFN',
  'TIME',
]);

/** 原样搬进译文、内容不翻译的元素 */
const ATOM_TAGS = new Set(['BR', 'IMG', 'CODE', 'KBD', 'SAMP', 'VAR', 'SVG', 'MATH', 'INPUT', 'WBR', 'PICTURE', 'VIDEO']);

export interface Placeholder {
  node: Element;
  kind: 'pair' | 'atom';
}

export interface Serialized {
  /** 发给模型的文本 */
  text: string;
  /** 去掉占位符后的纯文本，用于语言检测、长度判断 */
  plain: string;
  placeholders: Placeholder[];
}

export interface SerializeOptions {
  /** 不翻译的元素（站点规则 + 全局规则），出现在段落中间时按原子处理 */
  isExcluded?: (el: Element) => boolean;
  /** 插件自己插入的元素，直接跳过 */
  isOwn?: (el: Element) => boolean;
  /** 块级元素出现在强制段落内部时，前后补空格避免单词粘连 */
  isBlock?: (el: Element) => boolean;
}

export function escapeText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function unescapeText(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function serialize(nodes: Node[], opts: SerializeOptions = {}): Serialized {
  const placeholders: Placeholder[] = [];
  let text = '';
  let plain = '';

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node as Text).data.replace(/\s+/g, ' ');
      text += escapeText(t);
      plain += t;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (opts.isOwn?.(el)) return;
    const tag = el.tagName.toUpperCase();

    if (ATOM_TAGS.has(tag) || opts.isExcluded?.(el)) {
      const id = placeholders.push({ node: el, kind: 'atom' }) - 1;
      text += `<x${id}/>`;
      // 原子元素的文字对语言检测没用，但要占个位，避免两边单词粘连
      plain += tag === 'BR' ? '\n' : ' ';
      return;
    }

    const block = opts.isBlock?.(el) ?? false;
    if (block) {
      text += ' ';
      plain += ' ';
    }

    if (PAIR_TAGS.has(tag) && /\S/.test(el.textContent ?? '')) {
      const id = placeholders.push({ node: el, kind: 'pair' }) - 1;
      text += `<x${id}>`;
      el.childNodes.forEach(walk);
      text += `</x${id}>`;
    } else {
      // span、font 等无语义的包装直接展开
      el.childNodes.forEach(walk);
    }

    if (block) {
      text += ' ';
      plain += ' ';
    }
  };

  nodes.forEach(walk);
  return {
    text: text.replace(/ {2,}/g, ' ').trim(),
    plain: plain.replace(/[ \t]{2,}/g, ' ').trim(),
    placeholders,
  };
}

const TOKEN = /<x(\d+)\s*\/>|<x(\d+)>|<\/x(\d+)>/g;

function cloneForTranslation<T extends Node>(node: T, deep: boolean): T {
  const c = node.cloneNode(deep) as T;
  if (c.nodeType === Node.ELEMENT_NODE) {
    const el = c as unknown as Element;
    el.removeAttribute('id');
    el.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  }
  return c;
}

/** 按占位符还原出 DOM；结构不合法（未闭合、交叉、编号不存在、类型不对）返回 null */
export function deserialize(translated: string, placeholders: Placeholder[], doc: Document = document): DocumentFragment | null {
  const root = doc.createDocumentFragment();
  const stack: { id: number; el: Node }[] = [{ id: -1, el: root }];
  const top = () => stack[stack.length - 1].el;
  let last = 0;

  const pushText = (s: string) => {
    if (s) top().appendChild(doc.createTextNode(unescapeText(s)));
  };

  for (const m of translated.matchAll(TOKEN)) {
    pushText(translated.slice(last, m.index));
    last = m.index! + m[0].length;

    if (m[1] !== undefined) {
      const ph = placeholders[Number(m[1])];
      if (!ph) return null;
      // 成对标签被模型写成自闭合时，按原样整体搬过来
      top().appendChild(cloneForTranslation(ph.node, true));
    } else if (m[2] !== undefined) {
      const id = Number(m[2]);
      const ph = placeholders[id];
      if (!ph) return null;
      if (ph.kind === 'atom') {
        // 原子元素被写成了成对标签：放入原元素，忽略模型写在里面的内容
        top().appendChild(cloneForTranslation(ph.node, true));
        stack.push({ id, el: doc.createDocumentFragment() });
        continue;
      }
      const el = cloneForTranslation(ph.node, false);
      top().appendChild(el);
      stack.push({ id, el });
    } else {
      const id = Number(m[3]);
      if (stack.length < 2 || stack[stack.length - 1].id !== id) return null;
      stack.pop();
    }
  }
  pushText(translated.slice(last));
  if (stack.length !== 1) return null;
  return root;
}

export function stripPlaceholders(s: string) {
  return unescapeText(s.replace(TOKEN, ''));
}
