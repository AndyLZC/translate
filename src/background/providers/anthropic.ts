import Anthropic from '@anthropic-ai/sdk';
import type { CompletionRequest } from './index';

/** 翻译批次的输出上限：12 段 / 3000 字符的批次远用不到，留足余量避免截断 */
const MAX_TOKENS = 16000;

/** 这些模型在拒答时可以由服务端自动换模型重试（server-side fallback） */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Haiku 4.5 及更早的模型接受 temperature；Sonnet 5.5 / Opus 5.5 等新模型不接受采样参数，改用 effort 控制 */
const isHaiku = (model: string) => model.startsWith('claude-haiku');

export class ClaudeRefusalError extends Error {}

/** Claude 走 Anthropic 官方 SDK */
export async function completeAnthropic(req: CompletionRequest) {
  const { config, signal, useOfficialEndpoint } = req;
  const client = makeClient(req);

  const params = buildParams(req);
  const response =
    useOfficialEndpoint && FALLBACK_MODELS.has(config.model)
      ? await client.beta.messages.create(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal },
        )
      : await client.messages.create(params, { signal });

  if (response.stop_reason === 'refusal') {
    throw new ClaudeRefusalError('Claude 拒绝翻译这部分内容，可换一个模型再试');
  }
  // max_tokens 截断时仍返回已有部分：缺失的段落会被逐段补翻
  return {
    text: response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
    usage: { inputTokens: response.usage.input_tokens ?? 0, outputTokens: response.usage.output_tokens ?? 0 },
  };
}

function buildParams({ system, messages, config, temperature }: CompletionRequest) {
  return {
    model: config.model,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    // 翻译是简单任务：Haiku 用低温度保持稳定；新模型用 low effort 省时省钱
    ...(isHaiku(config.model) ? { temperature } : { output_config: { effort: 'low' as const } }),
  };
}

function makeClient({ config, baseURL }: CompletionRequest) {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL,
    // 扩展的 background 属于浏览器环境；Key 只存在本机，且只发往 Anthropic，不会暴露给网页
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

/** 流式输出：每收到一段文字就回调，结束时返回完整结果 */
export async function streamAnthropic(req: CompletionRequest, onDelta: (text: string) => void) {
  const client = makeClient(req);
  const params = buildParams(req);
  const onText = (delta: string) => onDelta(delta);
  // 两种流的类型不同，分开处理
  const message = req.useOfficialEndpoint && FALLBACK_MODELS.has(req.config.model)
    ? await client.beta.messages
        .stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal: req.signal })
        .on('text', onText)
        .finalMessage()
    : await client.messages.stream(params, { signal: req.signal }).on('text', onText).finalMessage();
  if (message.stop_reason === 'refusal') throw new ClaudeRefusalError('Claude 拒绝回答这部分内容，可换一个模型再试');
  const text = (message.content as { type: string; text?: string }[]).map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('');
  return {
    text,
    usage: { inputTokens: message.usage.input_tokens ?? 0, outputTokens: message.usage.output_tokens ?? 0 },
  };
}
