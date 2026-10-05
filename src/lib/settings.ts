import { storage } from 'wxt/utils/storage';
import type { ModelPrice } from './pricing';
import { defaultProviderConfigs, type ProviderConfig, type ProviderType } from './providers';
import type { Appearance, ThemeId } from './themes';

export type TranslationStyle = 'general' | 'tech' | 'academic' | 'news' | 'fiction' | 'casual';

export const TRANSLATION_STYLES: { value: TranslationStyle; label: string; hint: string }[] = [
  { value: 'general', label: '通用', hint: '自然流畅，忠实原文' },
  { value: 'tech', label: '技术文档', hint: '术语准确，代码和专有名词保留英文' },
  { value: 'academic', label: '学术论文', hint: '严谨正式，术语规范' },
  { value: 'news', label: '新闻资讯', hint: '简洁客观，符合中文新闻写法' },
  { value: 'fiction', label: '小说文学', hint: '保留语气和文采，对话自然' },
  { value: 'casual', label: '社交口语', hint: '轻松口语化，保留网络用语的味道' },
];

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
  /** 双语对照时译文相对原文的字号（1 = 一样大） */
  translationSize: number;
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
  /** YouTube 双语字幕 */
  youtubeEnabled: boolean;
  /** 自动备份设置（含 API Key）到浏览器书签和同步存储，卸载重装后自动恢复 */
  syncSettings: boolean;
  /** 划词翻译：icon 先显示小图标，auto 选中即翻译，off 关闭 */
  selectionMode: 'icon' | 'auto' | 'off';
  /** 选中的文字已经是目标语言时，翻译成这个语言 */
  secondaryLang: string;
  /** 输入框里连按三下空格翻译 */
  inputEnabled: boolean;
  inputTargetLang: string;
  /** 鼠标悬停段落时按下这个键翻译该段 */
  hoverKey: 'off' | 'Control' | 'Alt' | 'Shift';
  /** 自动翻译不是目标语言的网页 */
  autoTranslateForeign: boolean;
  /** 学习模式：译文后显示「解析」，可查看句子结构、词汇并追问 */
  learningMode: boolean;
  /** 解析详细程度：standard 只拆最难的一两句；detailed 逐句拆解并给仿写例句 */
  analysisDepth: 'standard' | 'detailed';
  /** 解析和追问单独用的服务商（例如翻译用便宜快的模型，解析用更强的模型）；same 表示和翻译相同 */
  analysisProvider: ProviderType | 'same';
  /** 生词高亮：生词本里的单词出现在网页上时标出，悬停看释义 */
  vocabHighlight: boolean;
  /** 当前服务商出错时自动改用的备用服务商；none 表示不切换 */
  fallbackProvider: ProviderType | 'none';
  /** 翻译风格预设 */
  translationStyle: TranslationStyle;
  /** 主题色、外观（跟随系统 / 浅色 / 深色） */
  accentTheme: ThemeId;
  appearance: Appearance;
  /** 费用估算：显示币种、汇率、自定义单价（每百万 token）、每月预算（0 表示不设） */
  currency: 'CNY' | 'USD';
  usdToCny: number;
  customPrices: Record<string, ModelPrice>;
  monthlyBudget: number;
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
  translationSize: 0.88,
  customPrompt: '',
  glossary: '',
  concurrency: 4,
  requestsPerMinute: 0,
  batchSize: 12,
  batchChars: 3000,
  alwaysTranslateSites: [],
  neverTranslateSites: [],
  showFloatingButton: true,
  youtubeEnabled: true,
  syncSettings: true,
  selectionMode: 'icon',
  secondaryLang: 'en',
  inputEnabled: true,
  inputTargetLang: 'en',
  hoverKey: 'Control',
  autoTranslateForeign: false,
  learningMode: true,
  analysisDepth: 'standard',
  analysisProvider: 'same',
  vocabHighlight: true,
  fallbackProvider: 'none',
  translationStyle: 'general',
  accentTheme: 'indigo',
  appearance: 'system',
  currency: 'CNY',
  usdToCny: 7.1,
  customPrices: {},
  monthlyBudget: 0,
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
export function normalizeSettings(stored: Partial<Settings> & LegacyFields & { backupAt?: number } = {}): Settings {
  // backupAt 只是备份文件里的时间戳，不属于设置
  const { apiKey, baseURL, model, backupAt: _backupAt, ...rest } = stored;
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
