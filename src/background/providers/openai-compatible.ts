import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
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

/** 流式输出：每收到一段文字就回调，结束时返回完整结果 */
export async function streamOpenAICompatible(req: CompletionRequest, onDelta: (text: string) => void) {
  const provider = createOpenAI({ apiKey: req.config.apiKey || 'none', baseURL: req.baseURL });
  let error: unknown;
  const result = streamText({
    model: provider.chat(req.config.model),
    system: req.system,
    messages: req.messages,
    temperature: req.temperature,
    maxRetries: 2,
    abortSignal: req.signal,
    onError: ({ error: e }) => {
      error = e;
    },
  });
  let text = '';
  for await (const delta of result.textStream) {
    text += delta;
    onDelta(delta);
  }
  if (error) throw error;
  const usage = await Promise.resolve(result.usage).catch(() => undefined);
  return { text, usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 } };
}
