import { sendMessage } from '@/lib/messaging';
import type { Settings } from '@/lib/settings';
import { GLOBAL_EXCLUDE, resolveSiteRule } from '@/lib/site-rules';
import { isOwnNode, LayoutCache, safeSelector } from './dom';
import { Extractor, type Unit } from './extractor';
import { removeTranslation, renderError, renderLoading, renderTranslation, type RenderOptions } from './renderer';

/**
 * 悬停翻译：鼠标停在段落上，单独按一下设定的键（默认 Ctrl），只翻译这一段；再按一次收起。
 * 「单独按一下」指按下后没有配合其他键，所以 Ctrl+C 之类的组合键不会触发。
 */
export class HoverTranslator {
  private x = 0;
  private y = 0;
  private armed = false;
  private extractor: Extractor | null = null;
  private translated = new WeakMap<Element, Unit[]>();

  constructor(
    private settings: Settings,
    private isPageTranslated: () => boolean,
    private renderOptions: RenderOptions,
  ) {}

  start() {
    document.addEventListener('mousemove', this.onMove, { passive: true, capture: true });
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('keyup', this.onKeyUp, true);
  }

  stop() {
    document.removeEventListener('mousemove', this.onMove, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('keyup', this.onKeyUp, true);
  }

  updateSettings(s: Settings) {
    if (s.targetLang !== this.settings.targetLang || s.customSiteRules !== this.settings.customSiteRules) this.extractor = null;
    this.settings = s;
  }

  private onMove = (e: MouseEvent) => {
    this.x = e.clientX;
    this.y = e.clientY;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.armed = !e.repeat && this.settings.hoverKey !== 'off' && e.key === this.settings.hoverKey;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.armed || e.key !== this.settings.hoverKey) return;
    this.armed = false;
    if (this.isPageTranslated()) return;
    const el = document.elementFromPoint(this.x, this.y);
    if (!el || isOwnNode(el) || el.closest('input, textarea, [contenteditable="true"]')) return;
    void this.toggle(el);
  };

  private getExtractor() {
    if (!this.extractor) {
      const rule = resolveSiteRule(location.hostname, this.settings.customSiteRules);
      this.extractor = new Extractor({
        targetLang: this.settings.targetLang,
        excludeSelector: safeSelector([GLOBAL_EXCLUDE, ...rule.exclude]),
        blockSelector: safeSelector(rule.blocks),
      });
    }
    return this.extractor;
  }

  private async toggle(target: Element) {
    const layout = new LayoutCache();
    let block: Element = target;
    while (!layout.isBlock(block) && block.parentElement && block !== document.body) block = block.parentElement;
    if (block === document.body || block === document.documentElement) return;

    const existing = this.translated.get(block);
    if (existing) {
      existing.forEach((u) => {
        removeTranslation(u);
        this.extractor?.forget(u);
      });
      this.translated.delete(block);
      return;
    }

    const units = this.getExtractor()
      .extract(block)
      .filter((u) => u.state === 'pending');
    if (!units.length) return;
    this.translated.set(block, units);
    units.forEach((u) => renderLoading(u));
    try {
      const res = await sendMessage('translate', {
        texts: units.map((u) => u.source.text),
        context: { title: document.title, url: location.href },
      });
      units.forEach((u, i) => {
        const t = res.translations[i];
        if (t != null) renderTranslation(u, t, this.renderOptions);
        else renderError(u, res.error || '翻译失败', () => void this.retry(block));
      });
    } catch (e) {
      units.forEach((u) => renderError(u, String(e), () => void this.retry(block)));
    }
  }

  private async retry(block: Element) {
    const units = this.translated.get(block);
    units?.forEach((u) => {
      removeTranslation(u);
      this.extractor?.forget(u);
    });
    this.translated.delete(block);
    await this.toggle(block);
  }
}
