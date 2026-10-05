import { browser } from 'wxt/browser';
import { sendMessage, type PageStatus } from '@/lib/messaging';
import type { DisplayMode, Settings } from '@/lib/settings';
import { GLOBAL_EXCLUDE, resolveSiteRule } from '@/lib/site-rules';
import { safeSelector } from './dom';
import { DomWatcher } from './dom-watcher';
import { Extractor, type Unit } from './extractor';
import {
  removeAllTranslations,
  removeTranslation,
  renderError,
  renderLoading,
  renderTranslation,
  type RenderOptions,
} from './renderer';
import { adoptStyles, clearAppearance, composedContains, findShadowRoots, mirrorAppearance, type ScanRoot } from './shadow';
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
  private lastError = '';
  /** 已接管的 shadow root（评论区等组件）及其宿主元素 */
  private shadowRoots = new Set<ShadowRoot>();
  private shadowHosts = new Set<Element>();
  /** 组件常在插入页面之后才 attachShadow，变化后过一会儿再找一次 shadow root */
  private discoverTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];

  constructor(
    private settings: Settings,
    private renderOptions: RenderOptions = {},
  ) {
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
    return {
      enabled: this.enabled,
      mode: this.settings.displayMode,
      total,
      done,
      failed,
      ...(failed && this.lastError ? { error: this.lastError } : {}),
    };
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
      old.activeProvider !== settings.activeProvider ||
      old.providers[old.activeProvider].model !== settings.providers[settings.activeProvider].model ||
      old.providers[old.activeProvider].baseURL !== settings.providers[settings.activeProvider].baseURL ||
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
    html.toggleAttribute('data-tx-learn', this.settings.learningMode);
    html.toggleAttribute('data-tx-learn-hover', this.settings.learnTrigger !== 'always');
    html.style.setProperty('--tx-tsize', `${this.settings.translationSize}em`);
    for (const host of this.shadowHosts) mirrorAppearance(host);
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
    this.watcher.start();
    this.scan(this.scanRoots());
    this.discoverLater(this.scanRoots());
    this.emit();
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.generation++;
    this.watcher.stop();
    this.viewport.disconnect();
    this.discoverTimers.forEach(clearTimeout);
    this.discoverTimers = [];
    this.discoverPending.forEach((p) => p.clear());
    for (const u of this.units.values()) removeTranslation(u); // shadow root 里的译文 querySelectorAll 找不到
    this.shadowHosts.forEach(clearAppearance);
    this.shadowHosts.clear();
    this.shadowRoots.clear();
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.queue = [];
    this.units.clear();
    this.lastError = '';
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

  private scan(roots: ScanRoot[]) {
    for (const root of roots) {
      this.extractFrom(root);
      this.adoptShadowRoots(root);
    }
  }

  private extractFrom(root: ScanRoot) {
    for (const unit of this.extractor.extract(root)) {
      this.units.set(unit.id, unit);
      if (unit.state === 'pending') this.viewport.observe(unit);
    }
  }

  /** 找出 root 里新出现的 shadow root：注入样式、同步显示属性、监听变化，并扫描里面的段落 */
  private adoptShadowRoots(root: ScanRoot): boolean {
    let found = false;
    for (const sr of findShadowRoots(root, this.extractor.isExcluded)) {
      if (this.shadowRoots.has(sr)) continue;
      found = true;
      this.shadowRoots.add(sr);
      this.shadowHosts.add(sr.host);
      adoptStyles(sr);
      mirrorAppearance(sr.host);
      this.watcher.observe(sr);
      this.extractFrom(sr);
    }
    return found;
  }

  /** 节流：变化后约 1.5 秒找一次、再过 2.5 秒补找一次；页面一直在变时也最多每 1.5 秒一轮 */
  private discoverLater(roots: ScanRoot[]) {
    roots.forEach((r) => this.discoverPending[0].add(r));
    this.armDiscover(0);
  }

  private discoverPending: [Set<ScanRoot>, Set<ScanRoot>] = [new Set(), new Set()];

  private armDiscover(stage: 0 | 1) {
    if (this.discoverTimers[stage] !== undefined) return;
    const gen = this.generation;
    this.discoverTimers[stage] = setTimeout(() => {
      this.discoverTimers[stage] = undefined;
      const all = [...this.discoverPending[stage]].filter((r) => r.isConnected);
      this.discoverPending[stage].clear();
      if (gen !== this.generation || !this.enabled) return;
      const roots = all.filter((r) => !all.some((o) => o !== r && composedContains(o, r)));
      if (roots.map((r) => this.adoptShadowRoots(r)).some(Boolean)) this.emit();
      if (stage === 0 && roots.length) {
        roots.forEach((r) => this.discoverPending[1].add(r));
        this.armDiscover(1);
      }
    }, stage === 0 ? 1500 : 2500);
  }

  private onDomChange(roots: ScanRoot[]) {
    if (!this.enabled) return;
    for (const unit of [...this.units.values()]) {
      const affected = !unit.block.isConnected || roots.some((r) => r.contains(unit.block) || unit.block.contains(r));
      if (!affected || !this.extractor.isStale(unit)) continue;
      this.drop(unit);
    }
    // 配置了 roots 的站点：只扫描落在这些容器内的部分
    let scoped: ScanRoot[] = roots;
    if (this.roots.length) {
      const allowed = this.scanRoots();
      scoped = roots.flatMap((r) => (allowed.some((s) => composedContains(s, r)) ? [r] : allowed.filter((s) => r.contains(s))));
    }
    scoped = scoped.filter((r) => r.isConnected);
    this.scan(scoped);
    this.discoverLater(scoped);
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
      error = messagingError(e);
    }
    if (gen !== this.generation) return;
    if (error) this.lastError = error;

    batch.forEach((u, i) => {
      if (!this.units.has(u.id)) return; // 期间原文变了，单元已被丢弃
      const t = translations[i];
      if (t != null) {
        u.state = 'done';
        renderTranslation(u, t, this.renderOptions);
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

  /** 导出整页双语 Markdown：已翻译的段落按页面顺序，原文作引用、译文跟在后面 */
  exportMarkdown(): { filename?: string; markdown?: string; error?: string } {
    const done = [...this.units.values()].filter((u) => u.state === 'done' && u.translationEl?.isConnected);
    if (!done.length) return { error: '页面还没有翻译完成的段落' };
    done.sort((a, b) => (a.translationEl!.compareDocumentPosition(b.translationEl!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const quote = (t: string) => t.split('\n').map((l) => `> ${l}`).join('\n');
    const parts = [`# ${document.title}`, '', `来源：<${location.href}>`, ''];
    for (const u of done) {
      const translation = (u.translationEl!.textContent ?? '').trim();
      parts.push(quote(u.source.plain), '', translation, '');
    }
    const title = document.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || location.hostname;
    return { filename: `${title}（双语）.md`, markdown: parts.join('\n') };
  }

  retryFailed() {
    this.enqueue([...this.units.values()].filter((u) => u.state === 'error').map((u) => ((u.state = 'pending'), u)));
  }
}

/** 页面打开后插件被更新/重新加载：这个标签页里的旧脚本已和插件断开，只能刷新页面 */
function messagingError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  let alive = true;
  try {
    alive = !!browser.runtime?.id;
  } catch {
    alive = false;
  }
  if (!alive || /context invalidated|Receiving end does not exist|Could not establish connection/i.test(msg)) {
    return '插件刚更新或重新加载过，请刷新这个页面后再翻译';
  }
  return msg;
}
