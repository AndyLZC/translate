import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Button, Segmented, Select, Switch } from '@/components/ui';
import { sendMessage, type PageStatus } from '@/lib/messaging';
import { TARGET_LANGUAGES, type DisplayMode } from '@/lib/settings';
import { hostMatches } from '@/lib/site-rules';
import { useSettings } from '@/lib/use-settings';

const MODES: { value: DisplayMode; label: string }[] = [
  { value: 'bilingual', label: '双语对照' },
  { value: 'translation', label: '只看译文' },
  { value: 'original', label: '只看原文' },
];

export default function App() {
  const [settings, update] = useSettings();
  const [tabId, setTabId] = useState<number>();
  const [host, setHost] = useState('');
  const [status, setStatus] = useState<PageStatus | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id);
      try {
        setHost(new URL(tab?.url ?? '').hostname);
      } catch {
        /* 无地址的页面 */
      }
      if (tab?.id == null) return setUnsupported(true);
      try {
        setStatus(await sendMessage('getStatus', undefined, tab.id));
      } catch {
        setUnsupported(true);
      }
    })();
  }, []);

  // 翻译进行中时刷新进度
  useEffect(() => {
    if (tabId == null || !status?.enabled) return;
    const t = setInterval(async () => {
      try {
        setStatus(await sendMessage('getStatus', undefined, tabId));
      } catch {
        /* 页面已跳转 */
      }
    }, 800);
    return () => clearInterval(t);
  }, [tabId, status?.enabled]);

  if (!settings) return <div className="w-80 p-4" />;

  const toggle = async () => {
    if (tabId == null) return;
    setStatus(await sendMessage('toggleTranslation', undefined, tabId));
  };

  const inList = (list: string[]) => !!host && list.some((p) => hostMatches(host, p));
  const setInList = (key: 'alwaysTranslateSites' | 'neverTranslateSites', on: boolean) => {
    const list = settings[key].filter((p) => !hostMatches(host, p));
    void update({ [key]: on ? [...list, host] : list });
  };

  const noKey = !settings.apiKey && !settings.baseURL;
  const progress = status?.enabled && status.total ? `${status.done}/${status.total}` : '';

  return (
    <div className="w-80 space-y-4 p-4 text-sm">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icon/48.png" className="h-6 w-6" alt="" />
          <span className="font-semibold">AI 双语翻译</span>
        </div>
        <button className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => browser.runtime.openOptionsPage()}>
          设置
        </button>
      </header>

      {noKey && (
        <div className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          还没有配置 API Key，
          <button className="underline" onClick={() => browser.runtime.openOptionsPage()}>
            去设置
          </button>
        </div>
      )}

      {unsupported ? (
        <p className="rounded-md bg-[var(--bg-muted)] p-3 text-xs text-[var(--fg-muted)]">
          这个页面无法翻译（浏览器内置页面或扩展商店），或者页面在安装插件前就已打开，刷新后再试。
        </p>
      ) : (
        <Button className="w-full" onClick={toggle} variant={status?.enabled ? 'secondary' : 'primary'}>
          {status?.enabled ? '显示原文' : '翻译此页面'}
          {progress && <span className="text-xs opacity-70">{progress}</span>}
        </Button>
      )}
      {!!status?.failed && <p className="text-xs text-red-600">{status.failed} 段翻译失败，可点页面上的"点击重试"或悬浮按钮的进度条重试。</p>}

      <div className="space-y-1.5">
        <div className="text-xs text-[var(--fg-muted)]">显示方式</div>
        <Segmented value={settings.displayMode} options={MODES} onChange={(v) => update({ displayMode: v })} />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-[var(--fg-muted)]">翻译成</div>
        <Select value={settings.targetLang} onChange={(e) => update({ targetLang: e.target.value })}>
          {TARGET_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>

      {host && (
        <div className="space-y-2.5 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">总是翻译 {host}</span>
            <Switch checked={inList(settings.alwaysTranslateSites)} onChange={(v) => setInList('alwaysTranslateSites', v)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">在此网站隐藏悬浮按钮</span>
            <Switch checked={inList(settings.neverTranslateSites)} onChange={(v) => setInList('neverTranslateSites', v)} />
          </div>
        </div>
      )}

      <footer className="text-xs text-[var(--fg-muted)]">
        快捷键 <kbd className="rounded border border-[var(--border)] px-1">Alt</kbd>+<kbd className="rounded border border-[var(--border)] px-1">A</kbd> 翻译/还原 · 模型 {settings.model}
      </footer>
    </div>
  );
}
