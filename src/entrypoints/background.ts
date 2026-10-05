import { browser } from 'wxt/browser';
import * as cache from '@/background/cache';
import { languageName } from '@/background/prompt';
import { complete } from '@/background/providers';
import { errorMessage, TranslationService } from '@/background/translation-service';
import { onMessage, sendMessage } from '@/lib/messaging';
import { providerConfigError } from '@/lib/providers';
import { clearBackup, readBackup, writeBackup } from '@/lib/backup';
import { activeProviderConfig, getSettings, settingsItem, watchSettings, type Settings } from '@/lib/settings';

const configError = (s: Settings) => providerConfigError(s.activeProvider, activeProviderConfig(s));

/**
 * 安装或更新插件后，已打开标签页里的旧脚本会和插件断开（翻译全部失败）。
 * 重新注入一份：新脚本启动时 WXT 会让旧脚本失效，旧的悬浮按钮随之移除。
 */
async function injectIntoOpenTabs() {
  for (const cs of browser.runtime.getManifest().content_scripts ?? []) {
    if (!cs.js?.length) continue;
    const tabs = await browser.tabs.query({ url: cs.matches?.includes('<all_urls>') ? ['http://*/*', 'https://*/*'] : cs.matches });
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id == null || tab.discarded) return;
        const target = { tabId: tab.id, allFrames: !!cs.all_frames };
        try {
          if (cs.css?.length) await browser.scripting.insertCSS({ target, files: cs.css as never });
          await browser.scripting.executeScript({
            target,
            files: cs.js as never,
            world: (cs as { world?: 'MAIN' | 'ISOLATED' }).world ?? 'ISOLATED',
          } as never);
        } catch {
          // 商店页面、浏览器内置页面等不允许注入
        }
      }),
    );
  }
}

/** 本地没有设置（新装或重装）时，从同步存储恢复 */
async function restoreFromBackup() {
  const local = await browser.storage.local.get('settings');
  if (local.settings) return false;
  const backup = await readBackup().catch(() => null);
  if (!backup) return false;
  await settingsItem.setValue(backup.settings);
  return true;
}

/** 设置变化后（防抖）写入同步存储；关闭同步时删除备份 */
function startBackupSync() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  watchSettings((s) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if (!s.syncSettings) {
          last = '';
          await clearBackup();
          return;
        }
        const json = JSON.stringify(s);
        if (json === last) return;
        last = json;
        await writeBackup(s);
      } catch (e) {
        console.warn('[ai-translate] 同步设置失败', e);
      }
    }, 2000);
  });
}

export default defineBackground(() => {
  const restored = restoreFromBackup();
  startBackupSync();

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

  onMessage('backupStatus', async () => {
    const b = await readBackup().catch(() => null);
    return { exists: !!b, updatedAt: b?.updatedAt ?? 0 };
  });
  onMessage('restoreBackup', async () => {
    const b = await readBackup().catch(() => null);
    if (!b) return { ok: false, message: '同步存储里没有找到备份' };
    await settingsItem.setValue(b.settings);
    return { ok: true, message: `已恢复 ${new Date(b.updatedAt).toLocaleString()} 的备份` };
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
    // 首次安装打开设置页；如果从同步存储恢复了配置就不打扰
    if (reason === 'install') {
      void restored.then((ok) => {
        if (!ok) void browser.runtime.openOptionsPage();
      });
    }
    if (reason === 'install' || reason === 'update') void injectIntoOpenTabs();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'toggle-translation') void toggleTab(tab?.id);
  });
});
