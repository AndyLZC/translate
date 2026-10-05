import { useEffect, useState } from 'react';
import { CircleAlert, Download, GraduationCap, Languages, LoaderCircle, MousePointerClick, RotateCcw, Settings as SettingsIcon, Sparkles, Star } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { dayKey, USAGE_KEY, type UsageData } from '@/background/usage';
import { formatMoney } from '@/lib/pricing';
import { monthDays, summarize } from '@/lib/usage-summary';
import { sendMessage, type PageStatus } from '@/lib/messaging';
import { PROVIDERS, providerConfigError, providerPreset, type ProviderType } from '@/lib/providers';
import { activeProviderConfig, TRANSLATION_STYLES, updateProvider, type TranslationStyle } from '@/lib/settings';
import { hostMatches } from '@/lib/site-rules';
import { useSettings } from '@/lib/use-settings';
import { cn } from '@/lib/utils';
import { DISPLAY_MODES, LanguageSelect } from '../options/shared';

export default function App() {
  const [settings, update] = useSettings();
  const [tabId, setTabId] = useState<number>();
  const [url, setUrl] = useState<URL | null>(null);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [usage, setUsage] = useState<UsageData>({});
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id);
      try {
        const u = new URL(tab?.url ?? '');
        if (/^https?:$/.test(u.protocol)) setUrl(u);
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
    void browser.storage.local.get(USAGE_KEY).then((r) => setUsage((r[USAGE_KEY] as UsageData | undefined) ?? {}));
  }, []);

  // 翻译进行中刷新进度
  useEffect(() => {
    if (tabId == null || !status?.enabled) return;
    const t = setInterval(async () => {
      try {
        setStatus(await sendMessage('getStatus', undefined, tabId));
      } catch {
        /* 页面已跳转 */
      }
    }, 700);
    return () => clearInterval(t);
  }, [tabId, status?.enabled]);

  if (!settings) return <div className="h-[480px] w-[360px]" />;

  const host = url?.hostname ?? '';
  const costOpts = { currency: settings.currency, usdToCny: settings.usdToCny };
  const today = summarize(usage, [dayKey()], settings.customPrices, costOpts);
  const month = summarize(usage, monthDays(usage), settings.customPrices, costOpts);
  const budgetPct = settings.monthlyBudget > 0 ? month.cost / settings.monthlyBudget : 0;
  const provider = activeProviderConfig(settings);
  const preset = providerPreset(settings.activeProvider);
  const setupError = providerConfigError(settings.activeProvider, provider);
  const modelOptions = [...new Set([provider.model, ...preset.models.map((m) => m.id)].filter(Boolean))];
  const isYouTube = /(^|\.)youtube\.com$/.test(host) && url?.pathname === '/watch';
  const busy = !!status?.enabled && status.done + status.failed < status.total;
  const pct = status?.total ? Math.round(((status.done + status.failed) / status.total) * 100) : 0;
  const inList = (list: string[]) => !!host && list.some((p) => hostMatches(host, p));
  const openOptions = (hash = '') => {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html${hash}`) });
    window.close();
  };

  // 总结面板显示在网页里，打开后关掉弹出窗口
  const summarizePage = async () => {
    if (tabId == null) return;
    await sendMessage('summarizePage', undefined, { tabId, frameId: 0 }).catch(() => {});
    window.close();
  };

  const toggle = async () => {
    if (tabId == null) return;
    setStatus(await sendMessage('toggleTranslation', undefined, tabId));
  };

  const download = (filename: string, content: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    a.download = filename;
    a.click();
  };

  const exportPage = async () => {
    if (tabId == null) return;
    const res = await sendMessage('exportPage', undefined, tabId).catch((e) => ({ error: String(e) }) as { error: string; markdown?: string; filename?: string });
    if (!res?.markdown) return setExportMsg(res?.error ?? '导出失败');
    download(res.filename ?? 'page.md', res.markdown, 'text/markdown');
    setExportMsg('已导出');
  };

  const exportSrt = async () => {
    if (tabId == null) return;
    const res = await sendMessage('exportSubtitles', undefined, tabId).catch((e) => ({ error: String(e) }) as { error: string; srt?: string; filename?: string });
    if (!res?.srt) return setExportMsg(res?.error ?? '导出失败');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([res.srt], { type: 'text/plain;charset=utf-8' }));
    a.download = res.filename ?? 'subtitles.srt';
    a.click();
    setExportMsg('已导出');
  };

  return (
    <div className="w-[360px] bg-background text-sm">
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <img src="/icon/48.png" className="size-7 rounded-lg" alt="" />
        <div className="min-w-0 flex-1">
          <div className="leading-tight font-semibold">AI 双语翻译</div>
          <div className="truncate text-xs text-muted-foreground">
            {preset.label} · {provider.model || '未设置模型'}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="设置" title="设置" onClick={() => openOptions()}>
          <SettingsIcon />
        </Button>
      </header>

      <div className="space-y-4 p-4">
        {setupError && (
          <Alert variant="warning">
            <CircleAlert />
            <AlertDescription>
              <p>
                {setupError.replace('请先在设置页', '还没有')}。
                <button className="font-medium underline underline-offset-2" onClick={() => openOptions('#models')}>
                  去设置
                </button>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {budgetPct >= 0.8 && (
          <Alert variant={budgetPct >= 1 ? 'destructive' : 'warning'}>
            <CircleAlert />
            <AlertDescription>
              <p>
                本月已用 {formatMoney(month.cost, settings.currency)}，{budgetPct >= 1 ? '已超出' : '接近'}预算 {formatMoney(settings.monthlyBudget, settings.currency)}。
              </p>
            </AlertDescription>
          </Alert>
        )}

        {unsupported ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            这个页面不能翻译（浏览器内置页面、扩展商店），或者页面在插件更新前就已打开，刷新后再试。
          </p>
        ) : (
          <div className="space-y-2">
            <Button size="lg" className="w-full" variant={status?.enabled ? 'outline' : 'default'} onClick={toggle}>
              {busy ? <LoaderCircle className="animate-spin" /> : status?.enabled ? <RotateCcw /> : <Languages />}
              {status?.enabled ? '显示原文' : '翻译此页面'}
              <kbd className="ml-1 rounded border border-current/25 px-1.5 font-mono text-[10px] opacity-70">Alt+A</kbd>
            </Button>
            <Button size="sm" variant="ghost" className="w-full" onClick={summarizePage}>
              <Sparkles />
              AI 总结本页
            </Button>
            {status?.enabled && status.total > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-all', status.failed ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    已翻译 {status.done}/{status.total} 段
                  </span>
                  {!!status.failed && <span className="text-destructive">{status.failed} 段失败</span>}
                </div>
                {status.error && <p className="text-xs text-destructive">{status.error}</p>}
              </div>
            )}
          </div>
        )}

        <SegmentedControl size="sm" value={settings.displayMode} onValueChange={(v) => update({ displayMode: v })} options={DISPLAY_MODES} />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">服务商</div>
            <Select value={settings.activeProvider} onValueChange={(v) => update({ activeProvider: v as ProviderType })}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.type} value={p.type}>
                    {p.label}
                    {providerConfigError(p.type, settings.providers[p.type]) ? <span className="text-muted-foreground">（未配置）</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">模型</div>
            <Select value={provider.model} onValueChange={(v) => updateProvider(settings.activeProvider, { model: v })}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="未设置" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">翻译成</div>
            <LanguageSelect size="sm" className="w-full sm:w-full" value={settings.targetLang} onChange={(v) => update({ targetLang: v })} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">翻译风格</div>
            <Select value={settings.translationStyle} onValueChange={(v) => update({ translationStyle: v as TranslationStyle })}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSLATION_STYLES.map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          {host && (
            <ToggleRow icon={<Star />} label={`总是翻译 ${host}`} checked={inList(settings.alwaysTranslateSites)} onChange={(on) => {
              const list = settings.alwaysTranslateSites.filter((p) => !hostMatches(host, p));
              void update({ alwaysTranslateSites: on ? [...list, host] : list });
            }} />
          )}
          <ToggleRow icon={<MousePointerClick />} label="划词翻译" checked={settings.selectionMode !== 'off'} onChange={(on) => update({ selectionMode: on ? 'icon' : 'off' })} />
          <ToggleRow icon={<GraduationCap />} label="学习模式（句子解析）" checked={settings.learningMode} onChange={(on) => update({ learningMode: on })} />
        </div>

        {(isYouTube || !!status?.done) && (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {!!status?.done && (
                <Button variant="outline" size="sm" onClick={exportPage}>
                  <Download />
                  导出双语 Markdown
                </Button>
              )}
              {isYouTube && (
                <Button variant="outline" size="sm" onClick={exportSrt}>
                  <Download />
                  导出字幕 SRT
                </Button>
              )}
              {exportMsg && <span className="text-xs text-muted-foreground">{exportMsg}</span>}
            </div>
          </>
        )}
      </div>

      <footer className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
        <button className="cursor-pointer hover:text-foreground" onClick={() => openOptions('#usage')} title="查看用量与费用">
          今日 {formatMoney(today.cost, settings.currency)} · {today.requests} 次请求
        </button>
        <button className="cursor-pointer hover:text-foreground" onClick={() => openOptions('#learning')}>
          生词本 →
        </button>
      </footer>
    </div>
  );
}

function ToggleRow({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
