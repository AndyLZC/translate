import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeAnthropic } from '@/background/providers/anthropic';
import type { CompletionRequest } from '@/background/providers';

function stubClaude(response: Record<string, unknown>) {
  const calls: { url: string; headers: Headers; body: Record<string, any> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'm',
          content: [{ type: 'text', text: '<seg id="1">你好</seg>' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          ...response,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return calls;
}

const req = (model: string, official = true): CompletionRequest => ({
  system: 'sys',
  prompt: '<seg id="1">Hello</seg>',
  config: { apiKey: 'sk-ant-x', baseURL: '', model },
  baseURL: 'https://api.anthropic.com',
  useOfficialEndpoint: official,
  temperature: 0.2,
  signal: new AbortController().signal,
});

describe('Claude provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Haiku：普通接口 + temperature，不带 effort', async () => {
    const calls = stubClaude({});
    expect(await completeAnthropic(req('claude-haiku-4-5'))).toBe('<seg id="1">你好</seg>');
    const { url, headers, body } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers.get('x-api-key')).toBe('sk-ant-x');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(body).toMatchObject({ model: 'claude-haiku-4-5', system: 'sys', temperature: 0.2, max_tokens: 16000 });
    expect(body.output_config).toBeUndefined();
  });

  it('Sonnet 5.5（官方地址）：low effort、不发 temperature、开启服务端拒答兜底', async () => {
    const calls = stubClaude({});
    await completeAnthropic(req('claude-sonnet-5-5'));
    const { url, headers, body } = calls[0];
    expect(url).toContain('/v1/messages?beta=true');
    expect(headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.temperature).toBeUndefined();
  });

  it('自定义代理地址不发 beta 参数', async () => {
    const calls = stubClaude({});
    await completeAnthropic(req('claude-opus-5-5', false));
    expect(calls[0].body.fallbacks).toBeUndefined();
    expect(calls[0].headers.get('anthropic-beta')).toBeNull();
  });

  it('拒答时报错，交给用户重试', async () => {
    stubClaude({ stop_reason: 'refusal', content: [] });
    await expect(completeAnthropic(req('claude-haiku-4-5'))).rejects.toThrow('拒绝翻译');
  });
});
