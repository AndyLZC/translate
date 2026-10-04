import type { Unit } from './extractor';

/**
 * 只翻译看得到的部分：段落进入可视区域（下方再多预留一屏）才交给 onVisible。
 * 同一个块级元素里可能有多个单元，按元素分组观察。
 */
export class ViewportScheduler {
  private observer: IntersectionObserver;
  private byElement = new Map<Element, Set<Unit>>();

  constructor(private onVisible: (units: Unit[]) => void) {
    this.observer = new IntersectionObserver((entries) => this.handle(entries), {
      rootMargin: '50% 0px 100% 0px',
    });
  }

  observe(unit: Unit) {
    const el = unit.block;
    let set = this.byElement.get(el);
    if (!set) {
      set = new Set();
      this.byElement.set(el, set);
      this.observer.observe(el);
    }
    set.add(unit);
  }

  unobserve(unit: Unit) {
    const set = this.byElement.get(unit.block);
    if (!set) return;
    set.delete(unit);
    if (!set.size) {
      this.byElement.delete(unit.block);
      this.observer.unobserve(unit.block);
    }
  }

  disconnect() {
    this.observer.disconnect();
    this.byElement.clear();
  }

  private handle(entries: IntersectionObserverEntry[]) {
    const visible: Unit[] = [];
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const set = this.byElement.get(e.target);
      if (!set) continue;
      visible.push(...set);
      this.byElement.delete(e.target);
      this.observer.unobserve(e.target);
    }
    if (visible.length) this.onVisible(visible);
  }
}
