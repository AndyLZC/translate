import { TRANSLATION_TAG } from './dom';
import type { Unit } from './extractor';
import { deserialize, stripPlaceholders } from './serializer';

/** 整块且很短（标题、按钮、菜单项）时，双语模式下译文跟在原文后面同一行显示 */
const INLINE_MAX_CHARS = 24;

export function ensureTranslationEl(unit: Unit): HTMLElement {
  if (unit.translationEl?.isConnected) return unit.translationEl;
  const el = document.createElement(TRANSLATION_TAG);
  el.setAttribute('lang', '');
  el.dataset.txUnit = String(unit.id);
  if (unit.whole && unit.source.plain.length <= INLINE_MAX_CHARS && !unit.source.plain.includes('\n')) {
    el.dataset.txInline = '';
  }
  // "只显示译文"模式会把原文块的 font-size 设成 0，这里先记下原字号
  try {
    el.style.setProperty('--tx-fs', getComputedStyle(unit.block).fontSize);
  } catch {
    /* 忽略 */
  }

  if (unit.whole) {
    unit.block.appendChild(el);
    unit.block.setAttribute('data-tx-whole', '');
  } else {
    const last = unit.nodes[unit.nodes.length - 1];
    const parent = last?.parentNode ?? unit.block;
    parent.insertBefore(el, last?.nextSibling ?? null);
  }
  unit.translationEl = el;
  return el;
}

export function renderLoading(unit: Unit) {
  const el = ensureTranslationEl(unit);
  el.dataset.txState = 'loading';
  const spinner = document.createElement('tx-loading');
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', '翻译中');
  spinner.title = '翻译中…';
  el.replaceChildren(spinner);
}

export interface RenderOptions {
  /** 学习模式：点译文后的「解析」 */
  onAnalyze?: (original: string, translation: string) => void;
}

/** 太短的（菜单、按钮、标题碎片）不显示「解析」 */
const LEARN_MIN_CHARS = 20;

export function renderTranslation(unit: Unit, translated: string, opts: RenderOptions = {}) {
  const el = ensureTranslationEl(unit);
  el.dataset.txState = 'done';
  const frag = deserialize(translated, unit.source.placeholders);
  if (frag) el.replaceChildren(frag);
  else el.textContent = stripPlaceholders(translated); // 占位符被模型弄乱：退回纯文本，保证页面不坏

  if (opts.onAnalyze && unit.source.plain.length >= LEARN_MIN_CHARS && /\s/.test(unit.source.plain)) {
    const translation = el.textContent ?? '';
    const learn = document.createElement('tx-learn');
    learn.textContent = '解析';
    learn.title = '句子结构、重点词汇、语法解析';
    learn.setAttribute('role', 'button');
    learn.tabIndex = 0;
    const open = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onAnalyze!(unit.source.plain, translation);
    };
    learn.addEventListener('click', open);
    learn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && open(e));
    el.append(learn);
  }
}

export function renderError(unit: Unit, message: string, onRetry: () => void) {
  const el = ensureTranslationEl(unit);
  el.dataset.txState = 'error';
  const btn = document.createElement('tx-retry');
  btn.setAttribute('role', 'button');
  btn.tabIndex = 0;
  // 只放一个小标签，原因写在提示里，避免整页铺满错误文字
  btn.textContent = '重试';
  btn.title = `翻译失败：${message}（点击重试）`;
  let fired = false;
  const retry = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (fired) return;
    fired = true;
    onRetry();
  };
  btn.addEventListener('click', retry);
  btn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && retry(e));
  el.replaceChildren(btn);
}

export function removeTranslation(unit: Unit) {
  unit.translationEl?.remove();
  unit.translationEl = undefined;
  if (unit.whole) unit.block.removeAttribute('data-tx-whole');
}

/** 清理页面上所有插件插入的内容 */
export function removeAllTranslations() {
  document.querySelectorAll(TRANSLATION_TAG).forEach((e) => e.remove());
  document.querySelectorAll('[data-tx-whole]').forEach((e) => e.removeAttribute('data-tx-whole'));
}
