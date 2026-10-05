import { hasTranslatableText, isTargetLanguage } from '@/lib/language';
import { isOwnNode, LayoutCache, OWN_TAGS } from './dom';
import { serialize, type Serialized } from './serializer';

export type UnitState = 'skipped' | 'pending' | 'queued' | 'loading' | 'done' | 'error';

/**
 * 一个翻译单元 = 某个块级元素里一段连续的行内内容。
 * 普通段落（<p>文字<a>链接</a></p>）整块就是一个单元；
 * 块里混着子块时（<div>文字<p>…</p>更多文字</div>），每段连续的行内内容各是一个单元。
 */
export interface Unit {
  id: number;
  block: Element;
  /** 原文节点（whole 为 true 时是生成单元那一刻 block 的全部子节点） */
  nodes: Node[];
  /** 是否占满整个块；只有整块单元支持"只显示译文" */
  whole: boolean;
  source: Serialized;
  /** 原文指纹，内容变化时据此重新翻译 */
  signature: string;
  state: UnitState;
  translationEl?: HTMLElement;
  /** 学习模式的「解析」标签，放在原文末尾（译文之前） */
  learnEl?: HTMLElement;
}

export interface ExtractorConfig {
  targetLang: string;
  /** 不翻译的元素（全局 + 站点），已拼成一个选择器 */
  excludeSelector: string;
  /** 强制整体作为段落的元素 */
  blockSelector: string;
}

let nextId = 1;

/** 单元原文的指纹：直接拼接原文节点的文字（跳过插件自己的元素） */
export function signatureOf(nodes: Iterable<Node>): string {
  let s = '';
  for (const n of nodes) {
    if (n.nodeType === Node.ELEMENT_NODE && OWN_TAGS.has((n as Element).tagName)) continue;
    s += n.textContent ?? '';
  }
  return s.replace(/\s+/g, ' ').trim();
}

export class Extractor {
  /** 已处理过的整块（强制段落或整块单元） */
  private wholeSeen = new WeakSet<Element>();
  /** 已处理过的行内片段：以片段里的每个顶层节点为 key */
  private runSeen = new WeakSet<Node>();

  constructor(private config: ExtractorConfig) {}

  /** 让某个单元的节点可以被重新识别（原文变了，需要重新翻译时） */
  forget(unit: Unit) {
    this.wholeSeen.delete(unit.block);
    unit.nodes.forEach((n) => this.runSeen.delete(n));
  }

  /** 单元原文是否已经变化（被删除、文字改了、前后插入了新的行内内容） */
  isStale(unit: Unit): boolean {
    if (!unit.block.isConnected) return true;
    if (unit.whole) {
      if (unit.nodes.some((n) => n.parentNode !== unit.block)) return true;
      return signatureOf(unit.block.childNodes) !== unit.signature;
    }
    const first = unit.nodes[0];
    if (!first || unit.nodes.some((n) => n.parentNode !== unit.block)) return true;
    if (signatureOf(unit.nodes) !== unit.signature) return true;
    const run = this.collectRun(first, new LayoutCache());
    return run.length !== unit.nodes.length || run.some((n, i) => n !== unit.nodes[i]);
  }

  private isExcluded = (el: Element) => !!this.config.excludeSelector && el.matches(this.config.excludeSelector);

  /** 扫描 root 下所有还没处理过的段落 */
  extract(root: Element): Unit[] {
    const layout = new LayoutCache();
    const units: Unit[] = [];
    const { blockSelector } = this.config;

    // 从 root 往上检查：root 本身在不翻译的区域里就直接返回
    for (let el: Element | null = root; el; el = el.parentElement) {
      if (OWN_TAGS.has(el.tagName) || this.isExcluded(el)) return units;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return /\S/.test((node as Text).data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        const el = node as Element;
        if (OWN_TAGS.has(el.tagName) || this.isExcluded(el) || layout.isHidden(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      },
    });

    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const parent = t.parentElement;
      if (!parent) continue;

      const forced = blockSelector ? parent.closest(blockSelector) : null;
      if (forced) {
        if (this.wholeSeen.has(forced)) continue;
        this.wholeSeen.add(forced);
        const unit = this.makeUnit(forced, [...forced.childNodes], true, layout);
        if (unit) units.push(unit);
        continue;
      }

      // 最近的块级祖先
      let block: Element = parent;
      while (!layout.isBlock(block) && block.parentElement && block !== document.body) block = block.parentElement;
      if (this.wholeSeen.has(block)) continue;

      // block 的哪个直接子节点包含这个文本
      let top: Node = t;
      while (top.parentNode !== block) top = top.parentNode!;
      if (this.runSeen.has(top)) continue;

      const run = this.collectRun(top, layout);
      run.forEach((n) => this.runSeen.add(n));

      const children = [...block.childNodes].filter((n) => !isOwnNode(n));
      const whole = run.length > 0 && children.every((n) => run.includes(n) || isBlankText(n));
      if (whole) this.wholeSeen.add(block);

      const unit = this.makeUnit(block, run, whole, layout);
      if (unit) units.push(unit);
    }
    return units;
  }

  /** 以 top 为中心向两边扩展，直到碰到块级兄弟节点 */
  private collectRun(top: Node, layout: LayoutCache): Node[] {
    const run: Node[] = [top];
    for (let n = top.previousSibling; n && !layout.breaksRun(n) && !isOwnNode(n); n = n.previousSibling) run.unshift(n);
    for (let n = top.nextSibling; n && !layout.breaksRun(n) && !isOwnNode(n); n = n.nextSibling) run.push(n);
    // 去掉两头的空白文本
    while (run.length && isBlankText(run[0])) run.shift();
    while (run.length && isBlankText(run[run.length - 1])) run.pop();
    return run;
  }

  private makeUnit(block: Element, nodes: Node[], whole: boolean, layout: LayoutCache): Unit {
    const source = serialize(nodes, {
      isExcluded: this.isExcluded,
      isOwn: (el) => OWN_TAGS.has(el.tagName),
      isBlock: (el) => layout.isBlock(el),
    });
    const translatable =
      nodes.length > 0 && hasTranslatableText(source.plain) && !isTargetLanguage(source.plain, this.config.targetLang);
    return {
      id: nextId++,
      block,
      nodes,
      whole,
      source,
      signature: signatureOf(nodes),
      state: translatable ? 'pending' : 'skipped',
    };
  }
}

function isBlankText(n: Node) {
  return (n.nodeType === Node.TEXT_NODE && !/\S/.test((n as Text).data)) || n.nodeType === Node.COMMENT_NODE;
}
