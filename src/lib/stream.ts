import { browser } from 'wxt/browser';
import type { AnalyzeRequest, FollowUpRequest } from './messaging';

/**
 * 流式请求：内容脚本 ↔ background 用长连接（Port）逐段推送模型输出。
 * 普通消息只能一问一答，没法边生成边显示。
 */
export const STREAM_PORT = 'ai-stream';

export type StreamRequest = ({ type: 'analyze' } & AnalyzeRequest) | ({ type: 'followUp' } & FollowUpRequest);

export type StreamEvent = { type: 'delta'; text: string } | { type: 'done'; text: string } | { type: 'error'; error: string };

/** 发起流式请求；返回完整结果。调用 abort() 会断开连接并让 background 取消请求 */
export function streamRequest(req: StreamRequest, onDelta: (text: string, full: string) => void) {
  const port = browser.runtime.connect({ name: STREAM_PORT });
  let full = '';
  let settled = false;
  const result = new Promise<{ text?: string; error?: string }>((resolve) => {
    const finish = (r: { text?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
      try {
        port.disconnect();
      } catch {
        /* 已断开 */
      }
    };
    port.onMessage.addListener((msg: StreamEvent) => {
      if (msg.type === 'delta') {
        full += msg.text;
        onDelta(msg.text, full);
      } else if (msg.type === 'done') {
        finish({ text: msg.text });
      } else {
        finish({ error: msg.error });
      }
    });
    port.onDisconnect.addListener(() =>
      finish(full ? { text: full } : { error: '连接中断：插件可能刚更新过，请刷新页面' }),
    );
  });
  port.postMessage(req);
  return {
    result,
    abort: () => {
      settled = true;
      port.disconnect();
    },
  };
}
