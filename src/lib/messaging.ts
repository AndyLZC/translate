import { defineExtensionMessaging } from '@webext-core/messaging';
import type { ProviderConfig, ProviderType } from './providers';
import type { DisplayMode } from './settings';

export interface TranslateRequest {
  /** 已经过占位符序列化的段落 */
  texts: string[];
  context?: { title?: string; url?: string };
}

export interface TranslateResponse {
  /** 与 texts 一一对应；null 表示这一段失败 */
  translations: (string | null)[];
  error?: string;
}

export interface PageStatus {
  enabled: boolean;
  mode: DisplayMode;
  total: number;
  done: number;
  failed: number;
}

interface ProtocolMap {
  // content / options → background
  translate(req: TranslateRequest): TranslateResponse;
  /** 不传则测试当前使用的服务商；设置页传入正在编辑的配置 */
  testConnection(provider?: { type: ProviderType; config: ProviderConfig }): { ok: boolean; message: string };
  cacheStats(): { count: number };
  clearCache(): { count: number };
  // popup / background → content
  toggleTranslation(): PageStatus;
  setTranslation(enabled: boolean): PageStatus;
  getStatus(): PageStatus;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
