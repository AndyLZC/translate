import { sendMessage, type PageStatus } from '@/lib/messaging';
import type { DisplayMode, Settings } from '@/lib/settings';
import { GLOBAL_EXCLUDE, resolveSiteRule } from '@/lib/site-rules';
import { safeSelector } from './dom';
import { DomWatcher } from './dom-watcher';
import { Extractor, type Unit } from './extractor';
import { removeAllTranslations, removeTranslation, renderError, renderLoading, renderTranslation } from './renderer';
import { ViewportScheduler } from './viewport';

/** 网页翻译的总控：扫描段落 → 等进入可视区域 → 攒批发给 background → 渲染 */
export class PageTranslator {
  private enabled = false;
  private units = new Map<number, Unit>();
  private queue: Unit[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private extractor!: Extractor;
  private viewport = new ViewportScheduler((units) => this.enqueue(units));
  private watcher = new DomWatcher((roots) => this.onDomChange(roots));
  private roots: string[] = [];
  /** 每次开启/关闭递增，丢弃过期请求的结果 */
  private generation = 0;
  private listeners = new Set<(s: PageStatus) => void>();

  constructor(private settings: Settings) {
    this.applyAppearance();
  }

  get isEnabled() {
    return this.enabled;
  }

  onStatus(cb: (s: PageStatus) => void) {
    this.listeners.add(cb);
    cb(this.status());
    return () => this.listeners.delete(cb);
  }

  status(): PageStatus {
    let total = 0;
    let done = 0;
    let failed = 0;
    for (const u of this.units.values()) {
      if (u.state === 'skipped') continue;
      total++;
      if (u.state === 'done') done++;
      else if (u.state === 'error') failed++;
    }
    return { enabled: this.enabled, mode: this.settings.displayMode, total, done, failed };
  }

  private emit() {
    const s = this.status();
    this.listeners.forEach((cb) => cb(s));
  }

  updateSettings(settings: Settings) {
    const old = this.settings;
    this.settings = settings;
    this.applyAppearance();
    const needRestart =
      old.targetLang !== settings.targetLang ||
      old.model !== settings.model ||
      old.baseURL !== settings.baseURL ||
      old.customSiteRules !== settings.customSiteRules ||
      old.customPrompt !== settings.customPrompt ||
      old.glossary !== settings.glossary;
    if (this.enabled && needRestart) {
      this.stop();
      this.start();
    } else {
      this.emit();
    }
  }

  private applyAppearance() {
    const html = document.documentElement;
    html.dataset.txMode = this.settings.displayMode;
    html.dataset.txTheme = this.settings.theme;
  }

  setMode(mode: DisplayMode) {
    this.settings = { ...this.settings, displayMode: mode };
    this.applyAppearance();
    this.emit();
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.generation++;
    const rule = resolveSiteRule(location.hostname, this.settings.customSiteRules);
    this.extractor = new Extractor({
      targetLang: this.settings.targetLang,
      excludeSelector: safeSelector([GLOBAL_EXCLUDE, ...rule.exclude]),
      blockSelector: safeSelector(rule.blocks),
    });
    this.roots = rule.roots;
    this.scan(this.scanRoots());
    this.watcher.start();
    this.emit();
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.generation++;
    this.watcher.stop();
    this.viewport.disconnect();
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.queue = [];
    this.units.clear();
    removeAllTranslations();
    this.emit();
  }

  toggle() {
    if (this.enabled) this.stop();
    else this.start();
  }

  /** 单页应用换了地址：已有单元会被 DomWatcher 识别为过期，这里补一次全量扫描 */
  rescan() {
    if (this.enabled) this.onDomChange(this.scanRoots());
  }

  private scanRoots(): Element[] {
    if (!this.roots.length) return [document.body];
    const found = this.roots.flatMap((sel) => {
      try {
        return [...document.querySelectorAll(sel)];
      } catch {
        return [];
      }
    });
    return found.length ? found : [document.body];
  }

  private scan(roots: Element[]) {
    for (const root of roots) {
      for (const unit of this.extractor.extract(root)) {
        this.units.set(unit.id, unit);
        if (unit.state === 'pending') this.viewport.observe(unit);
      }
    }
  }

  private onDomChange(roots: Element[]) {
    if (!this.enabled) return;
    for (const unit of [...this.units.values()]) {
      const affected = !unit.block.isConnected || roots.some((r) => r.contains(unit.block) || unit.block.contains(r));
      if (!affected || !this.extractor.isStale(unit)) continue;
      this.drop(unit);
    }
    // 配置了 roots 的站点：只扫描落在这些容器内的部分
    let scoped = roots;
    if (this.roots.length) {
      const allowed = this.scanRoots();
      scoped = roots.flatMap((r) => (allowed.some((s) => s.contains(r)) ? [r] : allowed.filter((s) => r.contains(s))));
    }
    this.scan(scoped.filter((r) => r.isConnected));
    this.emit();
  }

  private drop(unit: Unit) {
    this.units.delete(unit.id);
    this.viewport.unobserve(unit);
    this.queue = this.queue.filter((u) => u !== unit);
    unit.state = 'skipped';
    removeTranslation(unit);
    this.extractor.forget(unit);
  }

  private enqueue(units: Unit[]) {
    for (const u of units) {
      if (u.state !== 'pending' || !this.units.has(u.id)) continue;
      u.state = 'queued';
      this.queue.push(u);
    }
    if (this.queue.length && this.flushTimer === undefined) {
      this.flushTimer = setTimeout(() => this.flush(), 60);
    }
  }

  /** 按段数和字符数切成若干批，每批一个消息；background 再统一排队限流 */
  private flush() {
    this.flushTimer = undefined;
    const { batchSize, batchChars } = this.settings;
    while (this.queue.length) {
      const batch: Unit[] = [];
      let chars = 0;
      while (this.queue.length && batch.length < batchSize) {
        const next = this.queue[0];
        if (batch.length && chars + next.source.text.length > batchChars) break;
        batch.push(this.queue.shift()!);
        chars += next.source.text.length;
      }
      void this.translateBatch(batch);
    }
  }

  private async translateBatch(batch: Unit[]) {
    const gen = this.generation;
    batch.forEach((u) => {
      u.state = 'loading';
      renderLoading(u);
    });
    this.emit();

    let translations: (string | null)[] = [];
    let error = '';
    try {
      const res = await sendMessage('translate', {
        texts: batch.map((u) => u.source.text),
        context: { title: document.title, url: location.href },
      });
      translations = res.translations;
      error = res.error ?? '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (gen !== this.generation) return;

    batch.forEach((u, i) => {
      if (!this.units.has(u.id)) return; // 期间原文变了，单元已被丢弃
      const t = translations[i];
      if (t != null) {
        u.state = 'done';
        renderTranslation(u, t);
      } else {
        u.state = 'error';
        renderError(u, error || '翻译失败', () => this.retry(u));
      }
    });
    this.emit();
  }

  retry(unit: Unit) {
    if (!this.units.has(unit.id)) return;
    unit.state = 'pending';
    this.enqueue([unit]);
  }

  retryFailed() {
    this.enqueue([...this.units.values()].filter((u) => u.state === 'error').map((u) => ((u.state = 'pending'), u)));
  }
}
