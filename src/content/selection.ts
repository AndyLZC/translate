import { isTargetLanguage } from '@/lib/language';
import { sendMessage } from '@/lib/messaging';
import { addNote, hasNote, removeNoteByText } from '@/lib/notebook';
import { langLabel, type Settings } from '@/lib/settings';
import type { AnalysisPanel } from './analysis-panel';
import { copyText, h, icon, iconButton, isInsideUi, speak, toast, uiRoot } from './ui/host';

const MAX_CHARS = 3000;

/**
 * 划词翻译：选中文字 → 小图标（或直接弹出）→ 卡片显示译文；
 * 选中单个词时按词典格式显示音标、释义、例句。手机上长按选词同样可用。
 */
export class SelectionTranslator {
  private layer: HTMLElement | null = null;
  private lastText = '';
  private touchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private settings: Settings,
    private panel: AnalysisPanel,
  ) {}

  start() {
    document.addEventListener('mouseup', this.onMouseUp, true);
    document.addEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('mousedown', this.onMouseDown, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('scroll', this.onScroll, { passive: true, capture: true });
  }

  stop() {
    document.removeEventListener('mouseup', this.onMouseUp, true);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    document.removeEventListener('mousedown', this.onMouseDown, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('scroll', this.onScroll, true);
    this.close();
  }

  updateSettings(s: Settings) {
    this.settings = s;
    if (s.selectionMode === 'off') this.close();
  }

  close() {
    this.layer?.remove();
    this.layer = null;
  }

  /** 右键菜单「翻译选中文字」：不管设置如何都直接弹出卡片 */
  translateCurrentSelection() {
    const sel = this.readSelection();
    if (sel) void this.showCard(sel.text, sel.rect);
  }

  private onMouseDown = (e: MouseEvent) => {
    if (this.layer && !isInsideUi(e)) this.close();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  private onScroll = () => {
    // 小图标跟不上滚动，直接收起；卡片保留（用户可能在边看边滚）
    if (this.layer?.querySelector('.sel-icon')) this.close();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.settings.selectionMode === 'off' || e.button !== 0 || isInsideUi(e)) return;
    // 等浏览器更新完选区
    setTimeout(() => this.handleSelection(), 10);
  };

  /** 触屏没有 mouseup：选区稳定一会儿后再处理 */
  private onSelectionChange = () => {
    if (this.settings.selectionMode === 'off' || !matchMedia('(pointer: coarse)').matches) return;
    clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => this.handleSelection(), 600);
  };

  private readSelection(): { text: string; rect: DOMRect } | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!text || text.length > MAX_CHARS || !/\p{L}/u.test(text)) return null;
    const anchor = sel.anchorNode?.parentElement;
    // 输入框、可编辑区域里的选择交给输入框翻译，不打扰
    if (anchor?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return null;
    const rects = sel.getRangeAt(0).getClientRects();
    const rect = rects[rects.length - 1] ?? sel.getRangeAt(0).getBoundingClientRect();
    return { text, rect };
  }

  private handleSelection() {
    const sel = this.readSelection();
    if (!sel) return;
    if (sel.text === this.lastText && this.layer) return;
    this.lastText = sel.text;
    if (this.settings.selectionMode === 'auto') void this.showCard(sel.text, sel.rect);
    else this.showIcon(sel.text, sel.rect);
  }

  private showIcon(text: string, rect: DOMRect) {
    this.close();
    const layer = h('div', { class: 'layer' });
    const btn = h('button', { class: 'sel-icon', title: '翻译选中内容', attrs: { type: 'button', 'aria-label': '翻译选中内容' } }, icon('languages', 17));
    const { left, top } = place(rect, 30, 30);
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // 保留选区
    btn.addEventListener('click', () => void this.showCard(text, rect));
    layer.append(btn);
    uiRoot().append(layer);
    this.layer = layer;
  }

  private async showCard(text: string, rect: DOMRect) {
    this.close();
    const target = this.settings.targetLang;
    const to = isTargetLanguage(text, target) ? this.settings.secondaryLang : target;
    const layer = h('div', { class: 'layer' });
    const body = h('div', { class: 'card-body' }, h('div', { class: 'skeleton' }, h('i'), h('i'), h('i')));
    let result = '';
    let dictionary = false;

    const saveBtn = iconButton('heart', '收藏到生词本', async () => {
      const type = dictionary ? 'word' : 'sentence';
      if (saveBtn.classList.contains('on')) {
        await removeNoteByText(type, text);
        saveBtn.classList.remove('on');
        return toast('已从生词本移除');
      }
      await addNote({ type, text, meaning: result, url: location.href, title: document.title });
      saveBtn.classList.add('on');
      toast('已收藏到生词本');
    });
    saveBtn.disabled = true;

    const learnBtn = iconButton('sparkles', '语法解析', () => {
      this.close();
      void this.panel.open({ text, translation: dictionary ? undefined : result });
    });

    const head = h(
      'div',
      { class: 'card-head' },
      h('div', { class: 'lang' }, icon('languages', 13), `→ ${langLabel(to)}`),
      iconButton('volume', '朗读原文', () => speak(text, document.documentElement.lang || undefined)),
      iconButton('copy', '复制译文', async () => {
        if (!result) return;
        await copyText(result);
        toast('已复制');
      }),
      saveBtn,
      ...(this.settings.learningMode ? [learnBtn] : []),
      iconButton('x', '关闭', () => this.close()),
    );
    const card = h('div', { class: 'card', attrs: { role: 'dialog', 'aria-label': '划词翻译' } }, head, body);
    const { left, top } = place(rect, Math.min(400, innerWidth - 24), 240);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    layer.append(card);
    uiRoot().append(layer);
    this.layer = layer;

    const res = await sendMessage('translateText', { text, mode: 'selection', to }).catch((e) => ({ error: String(e) }) as { error: string; text?: string; dictionary?: boolean });
    if (this.layer !== layer) return;
    if (!res.text) {
      body.replaceChildren(h('div', { class: 'error', text: res.error ?? '翻译失败' }));
      return;
    }
    result = res.text;
    dictionary = !!res.dictionary;
    saveBtn.disabled = false;
    void hasNote(dictionary ? 'word' : 'sentence', text).then((on) => saveBtn.classList.toggle('on', on));
    body.replaceChildren(dictionary ? renderDictionary(res.text) : renderTranslation(text, res.text));
  }
}

function renderTranslation(src: string, out: string) {
  return h('div', {}, src.length > 60 ? h('div', { class: 'src', text: src }) : null, h('div', { class: 'out', text: out }));
}

/** 词典结果：首行「单词 音标」，中间是释义，「例：」开头的是例句 */
export function renderDictionary(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const box = h('div', { class: 'dict' });
  const [first, ...rest] = lines;
  if (first) {
    const m = first.match(/^(\S+(?:\s+\S+)?)\s+([/[].*)$/);
    box.append(h('div', { class: 'word' }, m ? m[1] : first, m ? h('span', { class: 'phon', text: m[2] }) : null));
  }
  for (const line of rest) {
    box.append(h('div', { class: /^例[:：]/.test(line) ? 'ex' : 'def', text: line }));
  }
  return box;
}

/** 浮层位置：放在选区下方，放不下就放上方，并保持在视口内 */
function place(rect: DOMRect, w: number, hgt: number) {
  const margin = 8;
  let left = Math.min(Math.max(margin, rect.right - Math.min(w, 30)), innerWidth - w - margin);
  if (w > 40) left = Math.min(Math.max(margin, rect.left), innerWidth - w - margin);
  let top = rect.bottom + 8;
  if (top + hgt > innerHeight - margin && rect.top - hgt - 8 > margin) top = rect.top - hgt - 8;
  top = Math.min(Math.max(margin, top), innerHeight - Math.min(hgt, 60) - margin);
  return { left, top };
}
