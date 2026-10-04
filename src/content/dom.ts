/** 插件插入页面的元素都用这些标签名，扫描和监听时据此识别并忽略 */
export const TRANSLATION_TAG = 'tx-translation';
export const OWN_TAGS = new Set(['TX-TRANSLATION', 'TX-LOADING', 'TX-FLOAT']);

export function isOwnNode(node: Node | null): boolean {
  for (let n = node; n; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE && OWN_TAGS.has((n as Element).tagName)) return true;
  }
  return false;
}

/** 浏览器没算出 display 时（测试环境、未挂载元素）按标签名兜底 */
const BLOCK_TAGS = new Set(
  'ADDRESS ARTICLE ASIDE BLOCKQUOTE CAPTION DD DETAILS DIALOG DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HGROUP HR LI MAIN NAV OL P PRE SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL BODY HTML'.split(
    ' ',
  ),
);

/**
 * 每次扫描用一个新的 LayoutCache：同一次扫描里 getComputedStyle 只算一次，
 * 下次扫描重新算（页面样式可能已经变了）。
 */
export class LayoutCache {
  private display = new WeakMap<Element, string>();
  private hasBlock = new WeakMap<Element, boolean>();

  displayOf(el: Element): string {
    let d = this.display.get(el);
    if (d === undefined) {
      d = getComputedStyle(el).display || '';
      if (!d) d = BLOCK_TAGS.has(el.tagName) ? 'block' : 'inline';
      this.display.set(el, d);
    }
    return d;
  }

  isHidden(el: Element) {
    return this.displayOf(el) === 'none';
  }

  /** inline、inline-block、contents 等都按行内处理，其余（block/flex/grid/table-cell/list-item…）算块级 */
  isBlock(el: Element): boolean {
    if (OWN_TAGS.has(el.tagName)) return true;
    const d = this.displayOf(el);
    return !(d.startsWith('inline') || d === 'contents' || d.startsWith('ruby') || d === 'none');
  }

  containsBlock(el: Element): boolean {
    let v = this.hasBlock.get(el);
    if (v === undefined) {
      v = false;
      for (const c of el.children) {
        if (this.isHidden(c)) continue;
        if (this.isBlock(c) || this.containsBlock(c)) {
          v = true;
          break;
        }
      }
      this.hasBlock.set(el, v);
    }
    return v;
  }

  /** 一个子节点是否会切断行内文本：块级元素，或内部含有块级元素的行内元素 */
  breaksRun(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    if (this.isHidden(el)) return false;
    return this.isBlock(el) || this.containsBlock(el);
  }
}

export function safeSelector(selectors: string[]): string {
  const ok = selectors.filter((s) => {
    try {
      document.createDocumentFragment().querySelector(s);
      return true;
    } catch {
      console.warn('[ai-translate] 无效的选择器已忽略:', s);
      return false;
    }
  });
  return ok.join(',');
}
