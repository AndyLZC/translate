/**
 * 模型服务商。每家单独保存 Key / 接口地址 / 模型，用户随时切换当前使用哪一家。
 * OpenAI、DeepSeek、自定义走 OpenAI 兼容接口；Claude 走 Anthropic 官方 SDK。
 */
export type ProviderType = 'openai' | 'deepseek' | 'anthropic' | 'custom';

export interface ProviderConfig {
  apiKey: string;
  /** 留空用默认地址 */
  baseURL: string;
  model: string;
}

export interface ProviderPreset {
  type: ProviderType;
  label: string;
  defaultBaseURL: string;
  defaultModel: string;
  /** 下拉建议；也可以手动输入任意模型名 */
  models: { id: string; note?: string }[];
  keyPlaceholder: string;
  description: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    type: 'openai',
    label: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', note: '便宜、快' },
      { id: 'gpt-4.1-mini' },
      { id: 'gpt-4.1-nano', note: '最便宜' },
      { id: 'gpt-4o' },
      { id: 'gpt-4.1' },
      { id: 'gpt-5-mini' },
    ],
    keyPlaceholder: 'sk-...',
    description: 'OpenAI 官方接口。',
  },
  {
    type: 'deepseek',
    label: 'DeepSeek',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', note: '推荐，便宜、中文好' },
      { id: 'deepseek-reasoner', note: '推理模型，慢，不建议用于翻译' },
    ],
    keyPlaceholder: 'sk-...',
    description: 'DeepSeek 官方接口（OpenAI 兼容）。',
  },
  {
    type: 'anthropic',
    label: 'Claude',
    defaultBaseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    models: [
      { id: 'claude-haiku-4-5', note: '推荐，快、便宜' },
      { id: 'claude-sonnet-5-5', note: '质量更高' },
      { id: 'claude-opus-5-5', note: '最高质量，较贵' },
    ],
    keyPlaceholder: 'sk-ant-...',
    description: 'Anthropic 官方接口（Claude）。',
  },
  {
    type: 'custom',
    label: '自定义',
    defaultBaseURL: '',
    defaultModel: '',
    models: [],
    keyPlaceholder: '本地服务可留空',
    description: '任何 OpenAI 兼容接口：OpenRouter、硅基流动、本地 Ollama（http://localhost:11434/v1）等。',
  },
];

export function providerPreset(type: ProviderType): ProviderPreset {
  return PROVIDERS.find((p) => p.type === type) ?? PROVIDERS[0];
}

export function defaultProviderConfigs(): Record<ProviderType, ProviderConfig> {
  return Object.fromEntries(
    PROVIDERS.map((p) => [p.type, { apiKey: '', baseURL: '', model: p.defaultModel }]),
  ) as Record<ProviderType, ProviderConfig>;
}

export function resolveBaseURL(type: ProviderType, cfg: ProviderConfig) {
  return (cfg.baseURL.trim() || providerPreset(type).defaultBaseURL).replace(/\/+$/, '');
}

/** 配置是否可用；不可用时返回给用户看的原因 */
export function providerConfigError(type: ProviderType, cfg: ProviderConfig): string | null {
  const label = providerPreset(type).label;
  if (type === 'custom' && !cfg.baseURL.trim()) return '请先在设置页填写自定义接口地址';
  if (!cfg.model.trim()) return `请先在设置页填写 ${label} 的模型名称`;
  if (type !== 'custom' && !cfg.apiKey.trim()) return `请先在设置页填写 ${label} 的 API Key`;
  return null;
}
