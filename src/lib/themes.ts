/**
 * 主题色。每套配色在浅色、深色下各有一组颜色：
 * - primary / primaryFg：按钮底色和按钮上的文字（琥珀、浅色系用深色字，保证看得清）
 * - accent / accentFg：浅色块（选中的导航、标签）和上面的文字
 * - link：网页上的「[解析]」、解析面板里的语法标签等直接写在背景上的主题色文字
 * 所有组合都经过 WCAG 对比度检查（见 tests/themes.test.ts）。
 */
export type ThemeId = 'indigo' | 'blue' | 'emerald' | 'teal' | 'amber' | 'rose' | 'violet' | 'slate';
export type Appearance = 'system' | 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  link: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const THEMES: Theme[] = [
  {
    id: 'indigo',
    label: '靛蓝',
    light: { primary: '#4f46e5', primaryFg: '#ffffff', accent: '#eef2ff', accentFg: '#3730a3', link: '#4f46e5' },
    dark: { primary: '#818cf8', primaryFg: '#0f1020', accent: '#272a4a', accentFg: '#c7d2fe', link: '#a5b4fc' },
  },
  {
    id: 'blue',
    label: '天蓝',
    light: { primary: '#2563eb', primaryFg: '#ffffff', accent: '#eff6ff', accentFg: '#1e40af', link: '#2563eb' },
    dark: { primary: '#60a5fa', primaryFg: '#0b1220', accent: '#1c2a44', accentFg: '#bfdbfe', link: '#93c5fd' },
  },
  {
    id: 'emerald',
    label: '翠绿',
    light: { primary: '#047857', primaryFg: '#ffffff', accent: '#ecfdf5', accentFg: '#065f46', link: '#047857' },
    dark: { primary: '#34d399', primaryFg: '#04281b', accent: '#123227', accentFg: '#a7f3d0', link: '#6ee7b7' },
  },
  {
    id: 'teal',
    label: '青碧',
    light: { primary: '#0f766e', primaryFg: '#ffffff', accent: '#f0fdfa', accentFg: '#115e59', link: '#0f766e' },
    dark: { primary: '#2dd4bf', primaryFg: '#042f2c', accent: '#103231', accentFg: '#99f6e4', link: '#5eead4' },
  },
  {
    id: 'amber',
    label: '琥珀',
    light: { primary: '#f59e0b', primaryFg: '#241500', accent: '#fffbeb', accentFg: '#92400e', link: '#b45309' },
    dark: { primary: '#fbbf24', primaryFg: '#211400', accent: '#3a2a0c', accentFg: '#fde68a', link: '#fcd34d' },
  },
  {
    id: 'rose',
    label: '玫红',
    light: { primary: '#e11d48', primaryFg: '#ffffff', accent: '#fff1f2', accentFg: '#9f1239', link: '#be123c' },
    dark: { primary: '#fb7185', primaryFg: '#2a0710', accent: '#3b1621', accentFg: '#fecdd3', link: '#fda4af' },
  },
  {
    id: 'violet',
    label: '紫罗兰',
    light: { primary: '#7c3aed', primaryFg: '#ffffff', accent: '#f5f3ff', accentFg: '#5b21b6', link: '#7c3aed' },
    dark: { primary: '#a78bfa', primaryFg: '#170b30', accent: '#2c2146', accentFg: '#ddd6fe', link: '#c4b5fd' },
  },
  {
    id: 'slate',
    label: '石墨',
    light: { primary: '#334155', primaryFg: '#ffffff', accent: '#f1f5f9', accentFg: '#1e293b', link: '#334155' },
    dark: { primary: '#cbd5e1', primaryFg: '#0f172a', accent: '#263040', accentFg: '#e2e8f0', link: '#cbd5e1' },
  },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function isDark(appearance: Appearance) {
  return appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}

// ---------- WCAG 对比度 ----------

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
