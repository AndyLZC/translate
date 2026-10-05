import { browser } from 'wxt/browser';
import * as cache from '@/background/cache';
import { languageName } from '@/background/prompt';
import { complete, stream } from '@/background/providers';
import { errorMessage, TranslationService } from '@/background/translation-service';
import { UsageRecorder } from '@/background/usage';
import { onMessage, sendMessage } from '@/lib/messaging';
import { providerConfigError } from '@/lib/providers';
import { clearBackup, readBackup, writeBackup } from '@/lib/backup';
import { STREAM_PORT, type StreamEvent, type StreamRequest } from '@/lib/stream';
import { activeProviderConfig, getSettings, settingsItem, updateSettings, watchSettings, type Settings } from '@/lib/settings';

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
        await writeBackup({ ...s, backupAt: Date.now() } as Settings);
      } catch (e) {
        console.warn('[ai-translate] 同步设置失败', e);
      }
    }, 2000);
  });
}

export default defineBackground(() => {
  const restored = restoreFromBackup();
  startBackupSync();

  const usage = new UsageRecorder();
  const service = new TranslationService({
    getSettings,
    complete,
    stream: (args, onDelta) => stream(args, onDelta),
    cache,
    onUsage: ({ model, chars, usage: u }) =>
      usage.record(model, { requests: 1, chars, inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 }),
  });

  onMessage('translate', ({ data }) => service.translate(data, configError));
  onMessage('translateText', ({ data }) => service.translateText(data, configError));
  onMessage('analyze', ({ data }) => service.analyze(data, configError));
  onMessage('followUp', ({ data }) => service.followUp(data, configError));

  onMessage('testConnection', async ({ data }) => {
    const settings = await getSettings();
    const provider = data ?? { type: settings.activeProvider, config: activeProviderConfig(settings) };
    const err = providerConfigError(provider.type, provider.config);
    if (err) return { ok: false, message: err };
    try {
      const started = Date.now();
      const { text } = await complete({
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

  // 流式请求（解析、追问）：边生成边推给页面；页面关闭面板时断开连接，这里取消请求
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== STREAM_PORT) return;
    const abort = new AbortController();
    let open = true;
    port.onDisconnect.addListener(() => {
      open = false;
      abort.abort();
    });
    const send = (e: StreamEvent) => {
      if (open) port.postMessage(e);
    };
    port.onMessage.addListener(async (req: StreamRequest) => {
      const onDelta = (text: string) => send({ type: 'delta', text });
      const res =
        req.type === 'analyze'
          ? await service.analyzeStream(req, onDelta, configError, abort.signal)
          : await service.followUpStream(req, onDelta, configError, abort.signal);
      send(res.error ? { type: 'error', error: res.error } : { type: 'done', text: res.text ?? '' });
    });
  });

  onMessage('backupStatus', async () => {
    const b = await readBackup().catch(() => null);
    return { exists: !!b, updatedAt: b?.updatedAt ?? 0, source: b?.source };
  });
  onMessage('restoreBackup', async () => {
    const b = await readBackup().catch(() => null);
    if (!b) return { ok: false, message: '没有找到备份（书签或浏览器同步存储里都没有）' };
    await settingsItem.setValue(b.settings);
    return { ok: true, message: `已恢复 ${new Date(b.updatedAt).toLocaleString()} 的备份` };
  });

  // iframe 里的翻译跟随顶层页面
  onMessage('frameSync', ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId != null) void sendMessage('syncTranslation', data, tabId).catch(() => {});
  });
  onMessage('frameState', async ({ sender }) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return false;
    const s = await sendMessage('getStatus', undefined, { tabId, frameId: 0 }).catch(() => null);
    return !!s?.enabled;
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

  // 手机版 Firefox 没有快捷键和右键菜单 API，要先判断
  browser.commands?.onCommand.addListener(async (command, tab) => {
    if (command === 'cycle-display-mode') {
      const order = ['bilingual', 'translation', 'original'] as const;
      const s = await getSettings();
      await updateSettings({ displayMode: order[(order.indexOf(s.displayMode) + 1) % order.length] });
      return;
    }
    if (command !== 'toggle-translation') return;
    const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    await toggleTab(id);
  });

  const createMenus = () => {
    if (!browser.contextMenus) return;
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({ id: 'toggle-translation', title: '翻译 / 还原此页面', contexts: ['page'] });
      browser.contextMenus.create({ id: 'translate-selection', title: '翻译「%s」', contexts: ['selection'] });
      browser.contextMenus.create({ id: 'analyze-selection', title: '解析这句话（学习模式）', contexts: ['selection'] });
    });
  };

  browser.runtime.onInstalled.addListener(({ reason }) => {
    createMenus();
    // 首次安装打开设置页；如果从同步存储恢复了配置就不打扰
    if (reason === 'install') {
      void restored.then((ok) => {
        if (!ok) void browser.runtime.openOptionsPage();
      });
    }
    if (reason === 'install' || reason === 'update') void injectIntoOpenTabs();
  });
  browser.contextMenus?.onClicked.addListener((info, tab) => {
    if (tab?.id == null) return;
    if (info.menuItemId === 'toggle-translation') void toggleTab(tab.id);
    // 发给选中文字所在的框架（可能是 iframe）
    const target = { tabId: tab.id, frameId: info.frameId ?? 0 };
    if (info.menuItemId === 'translate-selection') void sendMessage('translateSelection', undefined, target).catch(() => {});
    if (info.menuItemId === 'analyze-selection') void sendMessage('analyzeSelection', undefined, target).catch(() => {});
  });
});
