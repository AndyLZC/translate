import { browser } from 'wxt/browser';
import * as cache from '@/background/cache';
import { languageName } from '@/background/prompt';
import { complete } from '@/background/providers';
import { errorMessage, TranslationService } from '@/background/translation-service';
import { onMessage, sendMessage } from '@/lib/messaging';
import { providerConfigError } from '@/lib/providers';
import { activeProviderConfig, getSettings, type Settings } from '@/lib/settings';

const configError = (s: Settings) => providerConfigError(s.activeProvider, activeProviderConfig(s));

/**
 * 安装或更新插件后，已打开标签页里的旧脚本会和插件断开（翻译全部失败）。
 * 重新注入一份：新脚本启动时 WXT 会让旧脚本失效，旧的悬浮按钮随之移除。
 */
async function injectIntoOpenTabs() {
  const manifest = browser.runtime.getManifest();
  const cs = manifest.content_scripts?.[0];
  if (!cs?.js) return;
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null || tab.discarded) return;
      try {
        if (cs.css?.length) await browser.scripting.insertCSS({ target: { tabId: tab.id }, files: cs.css as never });
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: cs.js as never });
      } catch {
        // 商店页面、浏览器内置页面等不允许注入
      }
    }),
  );
}

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
    if (reason === 'install' || reason === 'update') void injectIntoOpenTabs();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'toggle-translation') void toggleTab(tab?.id);
  });
});
