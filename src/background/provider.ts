import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Settings } from '@/lib/settings';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * 模型接入层。目前接 OpenAI 及兼容接口（DeepSeek、Ollama、OpenRouter 等改 baseURL 即可）；
 * 以后加 Claude、Gemini 只需在这里按 provider 分支返回对应的 AI SDK 模型。
 */
export function getModel(s: Pick<Settings, 'apiKey' | 'baseURL' | 'model'>): LanguageModel {
  const openai = createOpenAI({
    apiKey: s.apiKey || 'none',
    baseURL: s.baseURL.trim().replace(/\/+$/, '') || OPENAI_BASE_URL,
  });
  // 用 Chat Completions 接口：兼容接口普遍只实现了这个
  return openai.chat(s.model);
}

export function isOfficialOpenAI(s: Pick<Settings, 'baseURL'>) {
  const base = s.baseURL.trim();
  return !base || base.replace(/\/+$/, '') === OPENAI_BASE_URL;
}

export function configError(s: Settings): string | null {
  if (!s.model.trim()) return '请先在设置页填写模型名称';
  if (isOfficialOpenAI(s) && !s.apiKey.trim()) return '请先在设置页填写 OpenAI API Key';
  return null;
}
