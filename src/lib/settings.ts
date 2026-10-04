import { storage } from 'wxt/utils/storage';
import { defaultProviderConfigs, type ProviderConfig, type ProviderType } from './providers';

export type DisplayMode = 'bilingual' | 'translation' | 'original';
export type TranslationTheme = 'none' | 'underline' | 'dim' | 'highlight' | 'italic';

export interface Settings {
  /** 当前使用的服务商 */
  activeProvider: ProviderType;
  /** 每家服务商各自的 Key / 接口地址 / 模型，只存本地，不同步 */
  providers: Record<ProviderType, ProviderConfig>;
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
  activeProvider: 'openai',
  providers: defaultProviderConfigs(),
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

/** 第一版只有一组 apiKey/baseURL/model 字段 */
interface LegacyFields {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

/** 补齐缺省值，并把旧版单一配置迁移到对应的服务商 */
export function normalizeSettings(stored: Partial<Settings> & LegacyFields = {}): Settings {
  const { apiKey, baseURL, model, ...rest } = stored;
  const providers = defaultProviderConfigs();
  for (const [type, cfg] of Object.entries(stored.providers ?? {})) {
    providers[type as ProviderType] = { ...providers[type as ProviderType], ...cfg };
  }
  let activeProvider = stored.activeProvider ?? DEFAULT_SETTINGS.activeProvider;
  if (!stored.providers && (apiKey || baseURL)) {
    activeProvider = baseURL ? 'custom' : 'openai';
    providers[activeProvider] = { apiKey: apiKey ?? '', baseURL: baseURL ?? '', model: model || providers[activeProvider].model };
  }
  return { ...DEFAULT_SETTINGS, ...rest, activeProvider, providers };
}

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

/** 只改某一家服务商的部分字段 */
export async function updateProvider(type: ProviderType, patch: Partial<ProviderConfig>): Promise<Settings> {
  const cur = await getSettings();
  return updateSettings({ providers: { ...cur.providers, [type]: { ...cur.providers[type], ...patch } } });
}

export function activeProviderConfig(s: Settings) {
  return s.providers[s.activeProvider];
}

export function watchSettings(cb: (s: Settings) => void) {
  return settingsItem.watch((v) => cb(normalizeSettings(v ?? undefined)));
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
