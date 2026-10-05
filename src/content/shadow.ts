import contentCss from '@/entrypoints/content/style.css?inline';
import { OWN_TAGS } from './dom';

/**
 * 网页里用 Shadow DOM 渲染的内容（评论区组件 Coral / OpenWeb、各种 Web Components）
 * 普通的 DOM 遍历、MutationObserver 和网页样式表都进不去，这里统一处理：
 * 找到 shadow root（包括 closed 模式的）、把译文样式注入进去、把显示模式等属性同步到宿主元素上。
 */
export type ScanRoot = Element | ShadowRoot;

const APPEARANCE_ATTRS = ['data-tx-mode', 'data-tx-theme', 'data-tx-learn', 'data-tx-learn-hover'];

/** 拿到元素的 shadow root：扩展可以读取 closed 模式的（Chrome: chrome.dom，Firefox: openOrClosedShadowRoot） */
export function shadowRootOf(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  const ff = (el as Element & { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot;
  if (ff !== undefined) return ff ?? null;
  const dom = (globalThis as { chrome?: { dom?: { openOrClosedShadowRoot?: (e: Element) => ShadowRoot | null } } }).chrome?.dom;
  try {
    return dom?.openOrClosedShadowRoot?.(el) ?? null;
  } catch {
    return null;
  }
}

/** root 下（含嵌套）所有的 shadow root；插件自己的界面跳过 */
export function findShadowRoots(root: ScanRoot, skip: (el: Element) => boolean = () => false): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const visit = (node: ScanRoot) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (OWN_TAGS.has((n as Element).tagName) || skip(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const check = (el: Element) => {
      const sr = shadowRootOf(el);
      if (sr) {
        out.push(sr);
        visit(sr);
      }
    };
    if (node instanceof Element && !OWN_TAGS.has(node.tagName) && !skip(node)) check(node);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) check(n as Element);
  };
  visit(root);
  return out;
}

/** a 是否包含 b（可以跨 Shadow DOM 边界） */
export function composedContains(a: Node, b: Node): boolean {
  for (let n: Node | null = b; n; n = n.parentNode ?? (n instanceof ShadowRoot ? n.host : null)) {
    if (n === a) return true;
  }
  return false;
}

/**
 * 页面样式表里的 html[data-tx-…] 在 shadow root 里匹配不到，改写成 :host(…)，
 * 再把这些属性同步到宿主元素上（mirrorAppearance）。
 */
export function shadowCss(css: string): string {
  return css.replace(/\bhtml((?:\[[^\]]+\])+)/g, ':host($1)');
}

let sheet: CSSStyleSheet | null | undefined;
const styled = new WeakSet<ShadowRoot>();

/** 把译文样式注入 shadow root（每个只注入一次） */
export function adoptStyles(root: ShadowRoot) {
  if (styled.has(root)) return;
  styled.add(root);
  const css = shadowCss(contentCss);
  try {
    if (sheet === undefined) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet!];
  } catch {
    // Firefox 内容脚本里构造的样式表不能给网页的 shadow root 用，退回 <style>
    sheet = null;
    const style = document.createElement('style');
    style.dataset.tx = '';
    style.textContent = css;
    root.prepend(style);
  }
}

/** 把 <html> 上的显示模式、主题、学习模式属性复制到宿主元素上，供 :host(…) 选择器使用 */
export function mirrorAppearance(host: Element) {
  const html = document.documentElement;
  for (const attr of APPEARANCE_ATTRS) {
    const v = html.getAttribute(attr);
    if (v == null) host.removeAttribute(attr);
    else host.setAttribute(attr, v);
  }
}

export function clearAppearance(host: Element) {
  for (const attr of APPEARANCE_ATTRS) host.removeAttribute(attr);
}
