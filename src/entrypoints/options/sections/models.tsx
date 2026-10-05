import { useEffect, useState } from 'react';
import { Bot, Check, CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, Plug, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { sendMessage } from '@/lib/messaging';
import { PROVIDERS, providerConfigError, providerPreset, type ProviderType } from '@/lib/providers';
import { updateProvider } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Group, PageHeader, Row, useDraft, type SectionProps } from '../layout';

const PROVIDER_COLORS: Record<ProviderType, string> = {
  openai: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  deepseek: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  anthropic: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  custom: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

export function ModelsSection({ settings, update }: SectionProps) {
  const [tab, setTab] = useState<ProviderType>(settings.activeProvider);
  // 在弹窗里切换了服务商时，跟着切到对应的卡片
  useEffect(() => setTab(settings.activeProvider), [settings.activeProvider]);

  return (
    <>
      <PageHeader icon={<Bot />} title="模型服务" description="可以同时配置多家服务商，随时切换正在使用的一家。API Key 只保存在你的浏览器里，只发送给对应服务商。" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PROVIDERS.map((p) => {
          const cfg = settings.providers[p.type];
          const ready = !providerConfigError(p.type, cfg);
          const active = settings.activeProvider === p.type;
          return (
            <button
              key={p.type}
              type="button"
              onClick={() => setTab(p.type)}
              className={cn(
                'group relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/40 hover:shadow-sm',
                tab === p.type && 'border-primary ring-[3px] ring-primary/15',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className={cn('grid size-8 place-items-center rounded-lg text-sm font-bold', PROVIDER_COLORS[p.type])}>{p.label.slice(0, 1)}</span>
                {active ? (
                  <Badge variant="success">
                    <Check />
                    使用中
                  </Badge>
                ) : ready ? (
                  <Badge variant="secondary">已配置</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    未配置
                  </Badge>
                )}
              </div>
              <div>
                <div className="font-semibold">{p.label}</div>
                <div className="truncate text-xs text-muted-foreground">{cfg.model || '未设置模型'}</div>
              </div>
            </button>
          );
        })}
      </div>

      <ProviderEditor key={tab} type={tab} settings={settings} update={update} />

      <div className="space-y-8">
      <Group title="生成参数">
        <Row label={`温度 ${settings.temperature.toFixed(1)}`} description="越低越稳定，翻译建议 0～0.3。Claude Sonnet / Opus 新模型不支持调整，会自动忽略。">
          <Slider className="w-full sm:w-56" min={0} max={1} step={0.1} value={[settings.temperature]} onValueChange={([v]) => update({ temperature: v })} />
        </Row>
      </Group>

      <Group title="速度与费用" description="多段合并成一个请求翻译更省 token；遇到 429（请求太频繁）时调低并发或设置每分钟上限。">
        <NumberRow label="并发请求数" value={settings.concurrency} min={1} max={20} onCommit={(v) => update({ concurrency: v })} />
        <NumberRow label="每分钟请求上限" description="0 表示不限制" value={settings.requestsPerMinute} min={0} max={10000} onCommit={(v) => update({ requestsPerMinute: v })} />
        <NumberRow label="每个请求的段落数" value={settings.batchSize} min={1} max={50} onCommit={(v) => update({ batchSize: v })} />
        <NumberRow label="每个请求的字符上限" value={settings.batchChars} min={200} max={20000} onCommit={(v) => update({ batchChars: v })} />
      </Group>
      </div>
    </>
  );
}

function ProviderEditor({ type, settings, update }: SectionProps & { type: ProviderType }) {
  const preset = providerPreset(type);
  const cfg = settings.providers[type];
  const [apiKey, setApiKey] = useDraft(cfg.apiKey);
  const [baseURL, setBaseURL] = useDraft(cfg.baseURL);
  const [model, setModel] = useDraft(cfg.model);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const active = settings.activeProvider === type;
  const draft = { apiKey: apiKey.trim(), baseURL: baseURL.trim(), model: model.trim() };
  const draftError = providerConfigError(type, draft);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await sendMessage('testConnection', { type, config: draft }));
    } catch (e) {
      setTest({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="mt-4 mb-8 gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="font-semibold">{preset.label}</div>
          <div className="text-xs text-muted-foreground">{preset.description}</div>
        </div>
        {active ? (
          <Badge variant="success" className="h-7 px-3">
            <CircleCheck />
            当前正在使用
          </Badge>
        ) : (
          <Button
            size="sm"
            disabled={!!draftError}
            title={draftError ?? ''}
            onClick={async () => {
              await updateProvider(type, draft);
              await update({ activeProvider: type });
            }}
          >
            <Zap />
            使用 {preset.label}
          </Button>
        )}
      </div>

      <div className="grid gap-5 px-5 py-5">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={`key-${type}`}>
            API Key
          </label>
          <div className="relative">
            <Input
              id={`key-${type}`}
              type={showKey ? 'text' : 'password'}
              placeholder={preset.keyPlaceholder}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              className="pr-10 font-mono"
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => updateProvider(type, { apiKey: apiKey.trim() })}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-0.5 right-0.5 text-muted-foreground"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? '隐藏' : '显示'}
            >
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor={`model-${type}`}>
              模型
            </label>
            <Input
              id={`model-${type}`}
              list={`models-${type}`}
              value={model}
              placeholder="模型名称"
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => updateProvider(type, { model: model.trim() })}
            />
            <datalist id={`models-${type}`}>
              {preset.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.note}
                </option>
              ))}
            </datalist>
            {!!preset.models.length && (
              <div className="flex flex-wrap gap-1.5">
                {preset.models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.note}
                    onClick={() => {
                      setModel(m.id);
                      void updateProvider(type, { model: m.id });
                    }}
                    className={cn(
                      'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent',
                      model === m.id && 'border-primary bg-accent text-accent-foreground',
                    )}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid content-start gap-2">
            <label className="text-sm font-medium" htmlFor={`url-${type}`}>
              接口地址
            </label>
            <Input
              id={`url-${type}`}
              placeholder={preset.defaultBaseURL || 'https://.../v1'}
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              onBlur={() => updateProvider(type, { baseURL: baseURL.trim() })}
            />
            <p className="text-xs text-muted-foreground">{preset.defaultBaseURL ? '留空使用官方地址；用代理或中转时再填。' : '必填，例如 https://openrouter.ai/api/v1'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={runTest} disabled={testing || !!draftError} title={draftError ?? ''}>
            {testing ? <LoaderCircle className="animate-spin" /> : <Plug />}
            {testing ? '测试中…' : '测试连接'}
          </Button>
          {test ? (
            <span className={cn('flex items-center gap-1.5 text-sm', test.ok ? 'text-success' : 'text-destructive')}>
              {test.ok ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
              {test.message}
            </span>
          ) : (
            draftError && <span className="text-sm text-muted-foreground">{draftError.replace('请先在设置页', '请先')}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function NumberRow({ label, description, value, min, max, onCommit }: { label: string; description?: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useDraft(String(value));
  return (
    <Row label={label} description={description}>
      <Input
        type="number"
        className="w-full sm:w-32"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.min(max, Math.max(min, Math.round(Number(draft) || min)));
          setDraft(String(n));
          onCommit(n);
        }}
      />
    </Row>
  );
}
