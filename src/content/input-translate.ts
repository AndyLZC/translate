import { sendMessage } from '@/lib/messaging';
import { langLabel, type Settings } from '@/lib/settings';
import { toast } from './ui/host';

const WINDOW_MS = 700;

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/**
 * 输入框翻译：在输入框里快速连按三下空格，把已输入的内容翻译成设定的语言（默认英文）。
 * 用浏览器的 insertText 替换内容，Ctrl/⌘+Z 可以撤销；聊天、评论、邮件编辑器都能用。
 */
export class InputTranslator {
  private spaces: number[] = [];
  private busy = false;

  constructor(private settings: Settings) {}

  start() {
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  stop() {
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  updateSettings(s: Settings) {
    this.settings = s;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.settings.inputEnabled || e.isComposing || e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key !== ' ') this.spaces = [];
      return;
    }
    const el = editableTarget(e.target);
    if (!el) return;
    const now = Date.now();
    this.spaces = [...this.spaces.filter((t) => now - t < WINDOW_MS), now];
    if (this.spaces.length < 3) return;
    this.spaces = [];
    e.preventDefault(); // 第三个空格不输入
    void this.translate(el);
  };

  private async translate(el: Editable) {
    if (this.busy) return;
    // 去掉前两下输入的空格
    const text = readValue(el).replace(/ {1,2}$/, '');
    if (!text.trim()) return;
    this.busy = true;
    const to = this.settings.inputTargetLang;
    const tip = toast(`正在翻译成${langLabel(to)}…`, 60_000);
    try {
      const res = await sendMessage('translateText', { text, mode: 'input', to });
      if (!res.text) {
        toast(`翻译失败：${res.error ?? '未知错误'}`);
        return;
      }
      replaceValue(el, res.text);
      tip.remove();
      toast(`已翻译成${langLabel(to)} · Ctrl/⌘+Z 可撤销`);
    } catch (e) {
      toast(`翻译失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.busy = false;
    }
  }
}

function editableTarget(t: EventTarget | null): Editable | null {
  if (t instanceof HTMLTextAreaElement && !t.readOnly && !t.disabled) return t;
  if (t instanceof HTMLInputElement && !t.readOnly && !t.disabled && /^(text|search|url|email|)$/.test(t.type)) return t;
  if (t instanceof HTMLElement && t.isContentEditable) {
    // 富文本编辑器：取最外层的可编辑容器
    let root: HTMLElement = t;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }
  return null;
}

function readValue(el: Editable): string {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.innerText.replace(/\n$/, '');
}

export function replaceValue(el: Editable, text: string) {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
  } else {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // insertText 会触发编辑器自己的 input 事件，并进入撤销栈
  const ok = document.execCommand('insertText', false, text);
  if (!ok || readValue(el) !== text) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, text);
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
}
