import { describe, expect, it } from 'vitest';
import { providerConfigError, resolveBaseURL } from '@/lib/providers';
import { normalizeSettings } from '@/lib/settings';

describe('providers', () => {
  it('各家服务商的必填项', () => {
    expect(providerConfigError('anthropic', { apiKey: '', baseURL: '', model: 'claude-haiku-4-5' })).toContain('Claude 的 API Key');
    expect(providerConfigError('deepseek', { apiKey: 'k', baseURL: '', model: '' })).toContain('模型名称');
    expect(providerConfigError('custom', { apiKey: '', baseURL: '', model: 'llama3' })).toContain('接口地址');
    expect(providerConfigError('custom', { apiKey: '', baseURL: 'http://localhost:11434/v1', model: 'llama3' })).toBeNull();
    expect(providerConfigError('openai', { apiKey: 'k', baseURL: '', model: 'gpt-4o-mini' })).toBeNull();
  });

  it('接口地址留空用默认值，去掉末尾斜杠', () => {
    expect(resolveBaseURL('deepseek', { apiKey: '', baseURL: '', model: '' })).toBe('https://api.deepseek.com/v1');
    expect(resolveBaseURL('anthropic', { apiKey: '', baseURL: '', model: '' })).toBe('https://api.anthropic.com');
    expect(resolveBaseURL('openai', { apiKey: '', baseURL: 'https://proxy.example.com/v1/', model: '' })).toBe('https://proxy.example.com/v1');
  });
});

describe('normalizeSettings', () => {
  it('默认 Claude 模型是 Haiku', () => {
    expect(normalizeSettings().providers.anthropic.model).toBe('claude-haiku-4-5');
  });

  it('旧版单一 OpenAI 配置迁移到 openai', () => {
    const s = normalizeSettings({ apiKey: 'sk-old', model: 'gpt-4.1-mini' } as never);
    expect(s.activeProvider).toBe('openai');
    expect(s.providers.openai).toEqual({ apiKey: 'sk-old', baseURL: '', model: 'gpt-4.1-mini' });
    expect('apiKey' in s).toBe(false);
  });

  it('旧版带自定义地址的配置迁移到自定义', () => {
    const s = normalizeSettings({ apiKey: '', baseURL: 'http://localhost:11434/v1', model: 'qwen2.5' } as never);
    expect(s.activeProvider).toBe('custom');
    expect(s.providers.custom.baseURL).toBe('http://localhost:11434/v1');
  });

  it('只存了部分服务商时补齐其余默认值', () => {
    const s = normalizeSettings({ activeProvider: 'deepseek', providers: { deepseek: { apiKey: 'k' } } } as never);
    expect(s.providers.deepseek).toEqual({ apiKey: 'k', baseURL: '', model: 'deepseek-chat' });
    expect(s.providers.openai.model).toBe('gpt-4o-mini');
  });
});
