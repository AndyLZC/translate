import { generateText } from 'ai';
import { browser } from 'wxt/browser';
import * as cache from '@/background/cache';
import { configError, getModel } from '@/background/provider';
import { languageName } from '@/background/prompt';
import { errorMessage, TranslationService, type CompleteFn } from '@/background/translation-service';
import { onMessage, sendMessage } from '@/lib/messaging';
import { DEFAULT_SETTINGS, getSettings, type Settings } from '@/lib/settings';

const REQUEST_TIMEOUT = 90_000;

const complete: CompleteFn = async ({ system, prompt, settings }) => {
  const { text } = await generateText({
    model: getModel(settings),
    system,
    prompt,
    temperature: settings.temperature,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  return text;
};

export default defineBackground(() => {
  const service = new TranslationService({ getSettings, complete, cache });

  onMessage('translate', ({ data }) => service.translate(data, configError));

  onMessage('testConnection', async ({ data }) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(await getSettings()), ...data };
    const err = configError(settings);
    if (err) return { ok: false, message: err };
    try {
      const started = Date.now();
      const text = await complete({
        system: `Translate the user's text into ${languageName(settings.targetLang)}. Output only the translation.`,
        prompt: 'Hello, world! The connection works.',
        settings,
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
