import { isOwnNode } from './dom';

/**
 * 监听页面 DOM 变化（无限滚动、单页应用切换、评论展开等），
 * 合并一段时间内的变化后，把受影响的子树交给回调重新扫描。
 */
export class DomWatcher {
  private observer: MutationObserver;
  private roots = new Set<Element>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private onChange: (roots: Element[]) => void,
    private delay = 400,
  ) {
    this.observer = new MutationObserver((records) => this.handle(records));
  }

  start() {
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  stop() {
    this.observer.disconnect();
    clearTimeout(this.timer);
    this.roots.clear();
  }

  private handle(records: MutationRecord[]) {
    for (const r of records) {
      if (isOwnNode(r.target)) continue;
      if (r.type === 'characterData') {
        if (r.target.parentElement) this.roots.add(r.target.parentElement);
        continue;
      }
      const relevant = [...r.addedNodes, ...r.removedNodes].some((n) => !isOwnNode(n));
      if (!relevant) continue;
      if (r.target.nodeType === Node.ELEMENT_NODE) this.roots.add(r.target as Element);
    }
    if (this.roots.size && this.timer === undefined) {
      this.timer = setTimeout(() => this.flush(), this.delay);
    }
  }

  private flush() {
    this.timer = undefined;
    const all = [...this.roots].filter((r) => r.isConnected);
    this.roots.clear();
    // 去掉被其他根包含的子树，避免重复扫描
    const roots = all.filter((r) => !all.some((o) => o !== r && o.contains(r)));
    if (roots.length) this.onChange(roots);
  }
}
