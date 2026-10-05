import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { CompletionRequest } from './index';

/** OpenAI、DeepSeek 以及任何 OpenAI 兼容接口，通过 Vercel AI SDK 调用 */
export async function completeOpenAICompatible({ system, messages, config, baseURL, temperature, signal }: CompletionRequest) {
  const provider = createOpenAI({ apiKey: config.apiKey || 'none', baseURL });
  const { text, usage } = await generateText({
    // 用 Chat Completions 接口：兼容接口普遍只实现了这个
    model: provider.chat(config.model),
    system,
    messages,
    temperature,
    maxRetries: 2,
    abortSignal: signal,
  });
  return { text, usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 } };
}
