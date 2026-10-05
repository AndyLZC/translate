import { providerPreset, resolveBaseURL, type ProviderConfig, type ProviderType } from '@/lib/providers';
import { activeProviderConfig, type Settings } from '@/lib/settings';
import { completeAnthropic } from './anthropic';
import { completeOpenAICompatible } from './openai-compatible';

const REQUEST_TIMEOUT = 90_000;

export interface CompletionResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  /** 对话消息；单轮请求就是一条 user 消息 */
  messages: ChatMessage[];
  config: ProviderConfig;
  baseURL: string;
  /** 是否是服务商的官方地址（代理地址可能不支持 beta 功能） */
  useOfficialEndpoint: boolean;
  temperature: number;
  signal: AbortSignal;
}

/** 用当前选中的服务商（或指定的服务商）完成一次请求 */
export async function complete(args: {
  system: string;
  /** 单轮请求的用户消息；多轮对话用 messages */
  prompt?: string;
  messages?: ChatMessage[];
  settings: Settings;
  provider?: { type: ProviderType; config: ProviderConfig };
}): Promise<CompletionResult> {
  const type = args.provider?.type ?? args.settings.activeProvider;
  const config = args.provider?.config ?? activeProviderConfig(args.settings);
  const baseURL = resolveBaseURL(type, config);
  const req: CompletionRequest = {
    system: args.system,
    messages: args.messages ?? [{ role: 'user', content: args.prompt ?? '' }],
    config,
    baseURL,
    useOfficialEndpoint: baseURL === providerPreset(type).defaultBaseURL,
    temperature: args.settings.temperature,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  };
  return type === 'anthropic' ? completeAnthropic(req) : completeOpenAICompatible(req);
}
