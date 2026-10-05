import { defineExtensionMessaging } from '@webext-core/messaging';
import type { ProviderConfig, ProviderType } from './providers';
import type { DisplayMode } from './settings';

export interface TranslateRequest {
  /** 已经过占位符序列化的段落 */
  texts: string[];
  context?: { title?: string; url?: string };
  /** subtitle：视频字幕，按更大的批次翻译，并提示模型这是连续的字幕 */
  kind?: 'page' | 'subtitle';
}

export interface TranslateResponse {
  /** 与 texts 一一对应；null 表示这一段失败 */
  translations: (string | null)[];
  error?: string;
}

export interface TranslateTextRequest {
  text: string;
  /** selection：划词；input：输入框里自己写的文字 */
  mode: 'selection' | 'input';
  /** 目标语言，默认用设置里的目标语言 */
  to?: string;
}

export interface TranslateTextResponse {
  text?: string;
  /** 是否按词典格式返回 */
  dictionary?: boolean;
  error?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalyzeRequest {
  text: string;
  /** 页面上已有的译文：有的话模型不再重复翻译 */
  translation?: string;
}

export interface FollowUpRequest {
  /** 被解析的原文 */
  text: string;
  /** 已给出的解析 */
  analysis: string;
  /** 之前的追问和回答 */
  history: ChatTurn[];
  question: string;
}

export interface PageStatus {
  enabled: boolean;
  mode: DisplayMode;
  total: number;
  done: number;
  failed: number;
  /** 最近一次失败的原因，给用户看 */
  error?: string;
}

interface ProtocolMap {
  // content / options → background
  translate(req: TranslateRequest): TranslateResponse;
  translateText(req: TranslateTextRequest): TranslateTextResponse;
  /** 学习模式：句子解析 */
  analyze(req: AnalyzeRequest): { text?: string; error?: string };
  /** 学习模式：追问 */
  followUp(req: FollowUpRequest): { text?: string; error?: string };
  /** 不传则测试当前使用的服务商；设置页传入正在编辑的配置 */
  testConnection(provider?: { type: ProviderType; config: ProviderConfig }): { ok: boolean; message: string };
  cacheStats(): { count: number };
  backupStatus(): { exists: boolean; updatedAt: number; source?: 'bookmark' | 'sync' };
  restoreBackup(): { ok: boolean; message: string };
  clearCache(): { count: number };
  /** 顶层页面的翻译开关变了：background 转告同一标签页的所有 iframe */
  frameSync(enabled: boolean): void;
  /** iframe 启动时询问顶层页面是否正在翻译 */
  frameState(): boolean;
  // popup / background → content
  toggleTranslation(): PageStatus;
  setTranslation(enabled: boolean): PageStatus;
  getStatus(): PageStatus;
  /** background → iframe：跟随顶层页面开 / 关翻译 */
  syncTranslation(enabled: boolean): void;
  /** 右键菜单：翻译选中的文字 */
  translateSelection(): void;
  /** 右键菜单：解析选中的句子 */
  analyzeSelection(): void;
  /** 导出整页双语 Markdown */
  exportPage(): { filename?: string; markdown?: string; error?: string };
  /** YouTube：导出双语字幕 */
  exportSubtitles(): { filename?: string; srt?: string; error?: string };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
