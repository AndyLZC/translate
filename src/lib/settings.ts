import { storage } from 'wxt/utils/storage';

export type DisplayMode = 'bilingual' | 'translation' | 'original';
export type TranslationTheme = 'none' | 'underline' | 'dim' | 'highlight' | 'italic';

export interface Settings {
  /** OpenAI 或兼容接口的 API Key，只存本地，不同步 */
  apiKey: string;
  /** 留空表示官方 https://api.openai.com/v1 */
  baseURL: string;
  model: string;
  temperature: number;
  targetLang: string;
  displayMode: DisplayMode;
  theme: TranslationTheme;
  /** 追加到系统提示词后面的自定义要求 */
  customPrompt: string;
  /** 每行一条：原文=译文 */
  glossary: string;
  /** 同时进行的请求数 */
  concurrency: number;
  /** 每分钟最多请求数，0 表示不限 */
  requestsPerMinute: number;
  /** 每个请求最多包含的段落数 */
  batchSize: number;
  /** 每个请求的原文字符上限 */
  batchChars: number;
  alwaysTranslateSites: string[];
  neverTranslateSites: string[];
  showFloatingButton: boolean;
  /** 用户自定义站点规则（JSON），会覆盖同名内置规则 */
  customSiteRules: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseURL: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  targetLang: 'zh-CN',
  displayMode: 'bilingual',
  theme: 'none',
  customPrompt: '',
  glossary: '',
  concurrency: 4,
  requestsPerMinute: 0,
  batchSize: 12,
  batchChars: 3000,
  alwaysTranslateSites: [],
  neverTranslateSites: [],
  showFloatingButton: true,
  customSiteRules: '',
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(cb: (s: Settings) => void) {
  return settingsItem.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v }));
}

export const TARGET_LANGUAGES: { code: string; label: string }[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
];

export function langLabel(code: string) {
  return TARGET_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
