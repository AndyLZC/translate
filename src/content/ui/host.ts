import { OWN_TAGS } from '../dom';
import { UI_CSS } from './styles';
import { registerThemedHost } from './theme';

/**
 * 页面里所有插件浮层（划词卡片、解析面板、提示）共用一个 Shadow DOM 宿主，
 * 不受原网站 CSS 影响，也不影响原网站。
 */
let shadow: ShadowRoot | null = null;
let hostEl: HTMLElement | null = null;

export function uiRoot(): ShadowRoot {
  if (shadow && hostEl?.isConnected) return shadow;
  hostEl = document.createElement('tx-ui');
  hostEl.style.cssText = 'all: initial; position: fixed; inset: 0 auto auto 0; z-index: 2147483647; width: 0; height: 0;';
  shadow = hostEl.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  shadow.appendChild(style);
  document.documentElement.appendChild(hostEl);
  registerThemedHost(hostEl);
  return shadow;
}

/** 事件是否发生在插件自己的浮层里 */
export function isInsideUi(e: Event): boolean {
  return e.composedPath().some((n) => n instanceof Element && OWN_TAGS.has(n.tagName));
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; attrs?: Record<string, string>; on?: Record<string, (e: Event) => void> } = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  if (props.title) el.title = props.title;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** lucide 风格的小图标（内联 SVG，不额外加载资源） */
const ICONS: Record<string, string> = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  sparkles: '<path d="M9.94 14.06 4 20M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  languages: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
};

export function icon(name: keyof typeof ICONS | string, size = 16): SVGSVGElement {
  return parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`,
  );
}

/** 解析插件内置的固定 SVG 字符串（不用 innerHTML） */
export function parseSvg(markup: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
}

export function iconButton(name: string, title: string, onClick: (e: Event) => void, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`, title, attrs: { type: 'button', 'aria-label': title }, on: { click: onClick } }, icon(name));
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** 朗读（浏览器自带语音合成，不消耗 API） */
export function speak(text: string, lang?: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (lang) u.lang = lang;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

/** 屏幕下方的短暂提示 */
export function toast(message: string, ms = 2600) {
  const root = uiRoot();
  root.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', text: message, attrs: { role: 'status' } });
  root.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 300);
  return el;
}
