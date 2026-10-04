/**
 * MAIN world 脚本与内容脚本之间的消息协议（window.postMessage）。
 * 网页自己的脚本也能发同样的消息，所以内容脚本只把收到的数据当作待显示的字幕文本，
 * 用 textContent 渲染，不当作指令执行。
 */
export const FROM_PAGE = 'ai-translate:yt-page';
export const TO_PAGE = 'ai-translate:yt-ext';

export interface CaptionTrackInfo {
  languageCode: string;
  kind?: string; // 'asr' 表示自动字幕
  name?: string;
}

export type PageMessage =
  | { source: typeof FROM_PAGE; type: 'timedtext'; url: string; text: string }
  | { source: typeof FROM_PAGE; type: 'tracks'; videoId: string; tracks: CaptionTrackInfo[]; active: string };

export type ExtMessage =
  | { source: typeof TO_PAGE; type: 'hello' }
  /** 打开播放器字幕；优先选不是 avoidLang 的人工字幕 */
  | { source: typeof TO_PAGE; type: 'enableCaptions'; avoidLang: string }
  | { source: typeof TO_PAGE; type: 'getTracks' };

/** 对联合类型逐个去掉 source 字段（内置 Omit 不会分发到联合的每个成员） */
export type WithoutSource<T> = T extends unknown ? Omit<T, 'source'> : never;
