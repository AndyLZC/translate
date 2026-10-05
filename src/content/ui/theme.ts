import type { Settings } from '@/lib/settings';
import { getTheme, type Appearance } from '@/lib/themes';

/**
 * 网页里插件元素的主题色：
 * - 浮层（划词卡片、解析面板、悬浮按钮）在 Shadow DOM 里，通过宿主元素上的 CSS 变量传进去
 * - 网页正文里的「[解析]」、加载圆点通过 <html> 上的 --tx-* 变量
 * 浮层的深浅色跟「外观」设置；网页正文里的元素跟着网页本身（系统深浅色）走。
 */
let current: { theme: string; appearance: Appearance } = { theme: 'indigo', appearance: 'system' };
const hosts = new Set<HTMLElement>();

function varsFor(themeId: string) {
  const t = getTheme(themeId);
  return {
    '--tx-primary': t.light.primary,
    '--tx-primary-fg': t.light.primaryFg,
    '--tx-accent': t.light.accent,
    '--tx-accent-fg': t.light.accentFg,
    '--tx-link': t.light.link,
    '--tx-primary-d': t.dark.primary,
    '--tx-primary-fg-d': t.dark.primaryFg,
    '--tx-accent-d': t.dark.accent,
    '--tx-accent-fg-d': t.dark.accentFg,
    '--tx-link-d': t.dark.link,
  };
}

function applyTo(el: HTMLElement) {
  for (const [k, v] of Object.entries(varsFor(current.theme))) el.style.setProperty(k, v);
  if (current.appearance === 'system') el.removeAttribute('data-scheme');
  else el.setAttribute('data-scheme', current.appearance);
}

/** 浮层宿主元素创建时注册，之后主题变化会自动更新 */
export function registerThemedHost(el: HTMLElement) {
  hosts.add(el);
  applyTo(el);
}

export function setUiTheme(s: Pick<Settings, 'accentTheme' | 'appearance'>) {
  current = { theme: s.accentTheme, appearance: s.appearance };
  hosts.forEach((h) => (h.isConnected ? applyTo(h) : hosts.delete(h)));
  const root = document.documentElement;
  const v = varsFor(current.theme);
  root.style.setProperty('--tx-link', v['--tx-link']);
  root.style.setProperty('--tx-link-d', v['--tx-link-d']);
}

/** 浮层 CSS 里用的变量块：浅色 / 深色两套，深色按外观设置或系统切换 */
export const THEME_VARS_LIGHT = `--primary: var(--tx-primary, #4f46e5); --primary-fg: var(--tx-primary-fg, #fff);
  --accent: var(--tx-accent, #eef2ff); --accent-fg: var(--tx-accent-fg, #3730a3); --label: var(--tx-link, #4f46e5);`;
export const THEME_VARS_DARK = `--primary: var(--tx-primary-d, #818cf8); --primary-fg: var(--tx-primary-fg-d, #0f1020);
  --accent: var(--tx-accent-d, #272a4a); --accent-fg: var(--tx-accent-fg-d, #c7d2fe); --label: var(--tx-link-d, #a5b4fc);`;

/** 生成「深色」规则：外观设为深色，或跟随系统且系统为深色 */
export function darkRules(selector: string, body: string) {
  return `@media (prefers-color-scheme: dark) { :host(:not([data-scheme='light'])) ${selector} { ${body} } }
:host([data-scheme='dark']) ${selector} { ${body} }`;
}
