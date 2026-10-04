import { browser } from 'wxt/browser';
import * as cache from '@/background/cache';
import { languageName } from '@/background/prompt';
import { complete } from '@/background/providers';
import { errorMessage, TranslationService } from '@/background/translation-service';
import { onMessage, sendMessage } from '@/lib/messaging';
import { providerConfigError } from '@/lib/providers';
import { activeProviderConfig, getSettings, type Settings } from '@/lib/settings';

const configError = (s: Settings) => providerConfigError(s.activeProvider, activeProviderConfig(s));

export default defineBackground(() => {
  const service = new TranslationService({ getSettings, complete, cache });

  onMessage('translate', ({ data }) => service.translate(data, configError));

  onMessage('testConnection', async ({ data }) => {
    const settings = await getSettings();
    const provider = data ?? { type: settings.activeProvider, config: activeProviderConfig(settings) };
    const err = providerConfigError(provider.type, provider.config);
    if (err) return { ok: false, message: err };
    try {
      const started = Date.now();
      const text = await complete({
        system: `Translate the user's text into ${languageName(settings.targetLang)}. Output only the translation.`,
        prompt: 'Hello, world! The connection works.',
        settings,
        provider,
      });
      return { ok: true, message: `连接成功（${Date.now() - started} ms）：${text.trim()}` };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  });

  onMessage('cacheStats', async () => ({ count: await cache.count() }));
  onMessage('clearCache', async () => ({ count: await cache.clear() }));

  const toggleTab = async (tabId?: number) => {
    if (tabId == null) return;
    try {
      await sendMessage('toggleTranslation', undefined, tabId);
    } catch {
      // 浏览器内置页面、扩展商店等无法注入脚本的页面
    }
  };

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'toggle-translation') return;
    const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    await toggleTab(id);
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    browser.contextMenus.create({ id: 'toggle-translation', title: '翻译 / 还原此页面', contexts: ['page'] });
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'toggle-translation') void toggleTab(tab?.id);
  });
});
