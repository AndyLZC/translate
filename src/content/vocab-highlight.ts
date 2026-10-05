import { listNotes, watchNotes, type NoteEntry } from '@/lib/notebook';
import type { Settings } from '@/lib/settings';
import { GLOBAL_EXCLUDE } from '@/lib/site-rules';
import { isOwnNode } from './dom';
import { renderDictionary } from './selection';
import { h, uiRoot } from './ui/host';

const HIGHLIGHT = 'tx-vocab';
const MAX_TEXT_NODES = 40_000;

/**
 * 生词高亮：生词本里的英文单词出现在网页上时自动标出（含复数、过去式、-ing 等常见变形），
 * 鼠标停在上面显示释义。用浏览器的 CSS Custom Highlight API，不改动网页的 DOM。
 */
export class VocabHighlighter {
  private words = new Map<string, NoteEntry>();
  private regex: RegExp | null = null;
  private byNode = new WeakMap<Text, { start: number; end: number; range: Range; word: string }[]>();
  private observer = new MutationObserver(() => this.scheduleScan());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tip: HTMLElement | null = null;
  private tipWord = '';
  private lastMove = 0;
  private unwatch: (() => void) | null = null;
  private enabled = false;

  constructor(private settings: Settings) {}

  static supported() {
    return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
  }

  start() {
    if (!VocabHighlighter.supported()) return;
    void listNotes().then((n) => this.setNotes(n));
    this.unwatch = watchNotes((n) => this.setNotes(n));
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('mousemove', this.onMove, { passive: true, capture: true });
    window.addEventListener('scroll', this.hideTip, { passive: true, capture: true });
  }

  stop() {
    this.unwatch?.();
    this.observer.disconnect();
    clearTimeout(this.timer);
    document.removeEventListener('mousemove', this.onMove, true);
    window.removeEventListener('scroll', this.hideTip, true);
    this.clear();
  }

  updateSettings(s: Settings) {
    const was = this.active();
    this.settings = s;
    if (this.active() !== was) this.scan();
  }

  private active() {
    return this.settings.vocabHighlight && this.words.size > 0;
  }

  private setNotes(notes: NoteEntry[]) {
    this.words.clear();
    for (const n of notes) {
      if (n.type === 'word' && /^[A-Za-z][A-Za-z'’-]{1,40}$/.test(n.text)) this.words.set(n.text.toLowerCase(), n);
    }
    const list = [...this.words.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[-'’]/g, '\\$&'));
    this.regex = list.length ? new RegExp(`\\b(${list.join('|')})(?:s|es|ed|d|ing)?\\b`, 'gi') : null;
    this.scan();
  }

  private scheduleScan() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.scan(), 1200);
  }

  private clear() {
    CSS.highlights?.delete(HIGHLIGHT);
    this.byNode = new WeakMap();
    this.hideTip();
  }

  /** 找出所有匹配位置，做成 Range 交给浏览器高亮 */
  scan() {
    this.clear();
    if (!this.active() || !this.regex || !document.body) return;
    const highlight = new Highlight();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || isOwnNode(parent) || parent.closest(GLOBAL_EXCLUDE) || parent.closest('tx-translation')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let count = 0;
    for (let n = walker.nextNode() as Text | null; n && count < MAX_TEXT_NODES; n = walker.nextNode() as Text | null, count++) {
      const text = n.data;
      if (text.length < 2) continue;
      const hits: { start: number; end: number; range: Range; word: string }[] = [];
      for (const m of text.matchAll(this.regex)) {
        const range = new Range();
        range.setStart(n, m.index!);
        range.setEnd(n, m.index! + m[0].length);
        highlight.add(range);
        hits.push({ start: m.index!, end: m.index! + m[0].length, range, word: m[1].toLowerCase() });
      }
      if (hits.length) this.byNode.set(n, hits);
    }
    CSS.highlights.set(HIGHLIGHT, highlight);
  }

  // ---------- 悬停显示释义 ----------

  private onMove = (e: MouseEvent) => {
    if (!this.active()) return;
    const now = Date.now();
    if (now - this.lastMove < 80) return;
    this.lastMove = now;
    const pos = caretAt(e.clientX, e.clientY);
    const hits = pos && pos.node.nodeType === Node.TEXT_NODE ? this.byNode.get(pos.node as Text) : undefined;
    const hit = hits?.find((h) => pos!.offset >= h.start && pos!.offset <= h.end && inRect(h.range.getBoundingClientRect(), e.clientX, e.clientY));
    if (!hit) return this.hideTip();
    if (this.tipWord === hit.word && this.tip?.isConnected) return;
    this.showTip(hit.word, hit.range.getBoundingClientRect());
  };

  private showTip(word: string, rect: DOMRect) {
    const note = this.words.get(word);
    if (!note) return;
    this.hideTip();
    this.tipWord = word;
    const tip = h('div', { class: 'layer' }, h('div', { class: 'vocab-tip' }, h('div', { class: 'vocab-badge', text: '生词本' }), renderDictionary(note.meaning || note.text)));
    const card = tip.firstElementChild as HTMLElement;
    const width = Math.min(320, innerWidth - 16);
    card.style.left = `${Math.min(Math.max(8, rect.left), innerWidth - width - 8)}px`;
    const below = rect.bottom + 8;
    card.style.top = below + 140 > innerHeight ? `${Math.max(8, rect.top - 8 - 140)}px` : `${below}px`;
    uiRoot().append(tip);
    this.tip = tip;
  }

  private hideTip = () => {
    this.tip?.remove();
    this.tip = null;
    this.tipWord = '';
  };
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

function inRect(r: DOMRect, x: number, y: number) {
  return x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;
}
