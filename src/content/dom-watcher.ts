import { isOwnNode } from './dom';
import { composedContains, type ScanRoot } from './shadow';

/**
 * 监听页面 DOM 变化（无限滚动、单页应用切换、评论展开等），
 * 合并一段时间内的变化后，把受影响的子树交给回调重新扫描。
 */
export class DomWatcher {
  private observer: MutationObserver;
  private roots = new Set<ScanRoot>();
  /** 额外监听的 shadow root（MutationObserver 监听 body 时看不到里面的变化） */
  private extra = new Set<ShadowRoot>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private onChange: (roots: ScanRoot[]) => void,
    private delay = 400,
  ) {
    this.observer = new MutationObserver((records) => this.handle(records));
  }

  start() {
    this.observer.observe(document.body, OPTIONS);
  }

  /** 同时监听某个 shadow root 里的变化 */
  observe(root: ShadowRoot) {
    if (this.extra.has(root)) return;
    this.extra.add(root);
    this.observer.observe(root, OPTIONS);
  }

  stop() {
    this.observer.disconnect();
    this.extra.clear();
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
      if (r.target instanceof Element || r.target instanceof ShadowRoot) this.roots.add(r.target);
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
    const roots = all.filter((r) => !all.some((o) => o !== r && composedContains(o, r)));
    if (roots.length) this.onChange(roots);
  }
}

const OPTIONS: MutationObserverInit = { childList: true, subtree: true, characterData: true };
