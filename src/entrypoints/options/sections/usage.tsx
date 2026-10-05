import { useEffect, useMemo, useState } from 'react';
import { ChartColumn, ExternalLink, RotateCcw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { dayKey, USAGE_KEY, type UsageData } from '@/background/usage';
import { BUILTIN_PRICES, costOf, formatMoney, PRICING_PAGES, priceFor, type ModelPrice } from '@/lib/pricing';
import { PROVIDERS, providerPreset, type ProviderType } from '@/lib/providers';
import { compact, monthDays, summarize } from '@/lib/usage-summary';
import { cn } from '@/lib/utils';
import { Group, PageHeader, Row, useDraft, type SectionProps } from '../layout';

const SOURCE_LABEL = { custom: '自定义', builtin: '参考价', fallback: '估算', none: '未设置' } as const;

export function UsageSection({ settings, update }: SectionProps) {
  const [data, setData] = useState<UsageData>({});
  useEffect(() => {
    const load = () => browser.storage.local.get(USAGE_KEY).then((r) => setData((r[USAGE_KEY] as UsageData) ?? {}));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const opts = { currency: settings.currency, usdToCny: settings.usdToCny };
  const prices = settings.customPrices;
  const days = Object.keys(data).sort().reverse();
  const today = summarize(data, [dayKey()], prices, opts);
  const month = summarize(data, monthDays(data), prices, opts);
  const last30 = summarize(data, days.slice(0, 30), prices, opts);
  const rows = days.slice(0, 30).flatMap((d) => Object.entries(data[d]).map(([model, e]) => ({ day: d, model, ...e, cost: costOf(model, e, prices, opts) })));
  const money = (n: number) => formatMoney(n, settings.currency);

  return (
    <>
      <PageHeader icon={<ChartColumn />} title="用量与费用" description="插件实际发给模型的请求和 token 数（命中缓存的不计），按下方单价估算费用。实际扣费以服务商账单为准。" />
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="本月费用" value={money(month.cost)} sub={`${compact(month.requests)} 次请求 · ${compact(month.inputTokens + month.outputTokens)} token`}>
            {settings.monthlyBudget > 0 && <BudgetMeter used={month.cost} budget={settings.monthlyBudget} money={money} />}
          </StatTile>
          <StatTile label="今天" value={money(today.cost)} sub={`${compact(today.requests)} 次请求 · 输入 ${compact(today.inputTokens)} / 输出 ${compact(today.outputTokens)}`} />
          <StatTile label="最近 30 天" value={money(last30.cost)} sub={`${compact(last30.requests)} 次请求 · 输入 ${compact(last30.inputTokens)} / 输出 ${compact(last30.outputTokens)}`} />
        </div>
        {last30.unpriced.length > 0 && (
          <p className="-mt-5 text-xs text-muted-foreground">未计入费用（没有单价）：{last30.unpriced.join('、')}，可在下方价格表里填写。</p>
        )}

        <Group title="明细（最近 30 天）">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2.5 font-medium">日期</th>
                    <th className="px-3 py-2.5 font-medium">服务商 / 模型</th>
                    <th className="px-3 py-2.5 text-right font-medium">请求</th>
                    <th className="px-3 py-2.5 text-right font-medium">输入 token</th>
                    <th className="px-3 py-2.5 text-right font-medium">输出 token</th>
                    <th className="px-5 py-2.5 text-right font-medium">费用</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {rows.map((r) => (
                    <tr key={r.day + r.model}>
                      <td className="px-5 py-2.5 whitespace-nowrap">{r.day}</td>
                      <td className="px-3 py-2.5">{r.model}</td>
                      <td className="px-3 py-2.5 text-right">{r.requests.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{r.inputTokens.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{r.outputTokens.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{r.cost == null ? <span className="text-muted-foreground">—</span> : money(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Card className="border-0 py-8 text-center text-sm text-muted-foreground shadow-none">还没有用量记录</Card>
          )}
        </Group>

        <Group title="费用设置">
          <Row label="显示币种">
            <SegmentedControl
              className="sm:w-48"
              value={settings.currency}
              onValueChange={(v) => update({ currency: v })}
              options={[
                { value: 'CNY', label: '人民币 ¥' },
                { value: 'USD', label: '美元 $' },
              ]}
            />
          </Row>
          <NumberRow label="汇率" description="1 美元兑人民币，用于不同币种的价格换算" value={settings.usdToCny} step={0.01} onCommit={(v) => update({ usdToCny: v })} />
          <NumberRow
            label={`每月预算（${settings.currency === 'CNY' ? '¥' : '$'}）`}
            description="超过 80% 时弹窗里会提醒；0 表示不设预算"
            value={settings.monthlyBudget}
            step={1}
            onCommit={(v) => update({ monthlyBudget: v })}
          />
        </Group>

        <PriceTable settings={settings} update={update} usedModels={[...new Set(rows.map((r) => r.model))]} />
      </div>
    </>
  );
}

function StatTile({ label, value, sub, children }: { label: string; value: string; sub: string; children?: React.ReactNode }) {
  return (
    <Card className="gap-1.5 px-5 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {children}
    </Card>
  );
}

/** 预算进度：轨道是同色系的浅色，超过 80% 变警告色，超出变危险色 */
function BudgetMeter({ used, budget, money }: { used: number; budget: number; money: (n: number) => string }) {
  const pct = Math.min(100, (used / budget) * 100);
  const level = used >= budget ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="mt-2 space-y-1">
      <div className={cn('h-1.5 overflow-hidden rounded-full', level === 'ok' ? 'bg-primary/15' : level === 'warn' ? 'bg-warning/20' : 'bg-destructive/20')}>
        <div className={cn('h-full rounded-full', level === 'ok' ? 'bg-primary' : level === 'warn' ? 'bg-warning' : 'bg-destructive')} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn('text-xs', level === 'over' ? 'text-destructive' : 'text-muted-foreground')}>
        预算 {money(budget)} · 已用 {Math.round((used / budget) * 100)}%{level === 'over' ? '，已超出' : ''}
      </div>
    </div>
  );
}

function NumberRow({ label, description, value, step, onCommit }: { label: string; description?: string; value: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useDraft(String(value));
  return (
    <Row label={label} description={description}>
      <Input
        type="number"
        min={0}
        step={step}
        className="w-full sm:w-32"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.max(0, Number(draft) || 0);
          setDraft(String(n));
          onCommit(n);
        }}
      />
    </Row>
  );
}

/** 价格表：已配置服务商的常用模型 + 用过的模型；可改单价，改过的标「自定义」 */
function PriceTable({ settings, update, usedModels }: SectionProps & { usedModels: string[] }) {
  const keys = useMemo(() => {
    const set = new Set(usedModels);
    for (const p of PROVIDERS) {
      const cfg = settings.providers[p.type];
      if (cfg.model) set.add(`${p.type}/${cfg.model}`);
      if (p.type === settings.activeProvider || cfg.apiKey) for (const m of p.models) if (BUILTIN_PRICES[m.id]) set.add(`${p.type}/${m.id}`);
    }
    return [...set].sort();
  }, [usedModels, settings.providers, settings.activeProvider]);

  const setPrice = (model: string, price: ModelPrice | null) => {
    const next = { ...settings.customPrices };
    if (price) next[model] = price;
    else delete next[model];
    void update({ customPrices: next });
  };

  return (
    <Group
      title="价格表（每百万 token）"
      description="内置的是各服务商公开的参考价，可能已经调整，以官网为准；直接修改即可覆盖。DeepSeek 按「缓存未命中」价格计算，实际可能更便宜。"
    >
      <div className="divide-y">
        {keys.map((key) => {
          const [provider, ...rest] = key.split('/');
          const model = rest.join('/');
          const info = priceFor(provider, model, settings.customPrices);
          return (
            <PriceRow
              key={key}
              provider={provider as ProviderType}
              model={model}
              price={info.price}
              source={info.source}
              borrowed={info.borrowed}
              onChange={(p) => setPrice(model, p)}
              onReset={settings.customPrices[model] ? () => setPrice(model, null) : undefined}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-xs text-muted-foreground">
        官方价格页：
        {Object.entries(PRICING_PAGES).map(([p, url]) => (
          <a key={p} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
            {providerPreset(p as ProviderType).label}
            <ExternalLink className="size-3" />
          </a>
        ))}
      </div>
    </Group>
  );
}

function PriceRow({
  provider,
  model,
  price,
  source,
  borrowed,
  onChange,
  onReset,
}: {
  provider: ProviderType;
  model: string;
  price: ModelPrice | null;
  source: keyof typeof SOURCE_LABEL;
  borrowed?: string;
  onChange: (p: ModelPrice) => void;
  onReset?: () => void;
}) {
  const [input, setInput] = useDraft(price ? String(price.input) : '');
  const [output, setOutput] = useDraft(price ? String(price.output) : '');
  const currency = price?.currency ?? (provider === 'deepseek' ? 'CNY' : 'USD');
  const commit = (cur = currency) => {
    const i = Number(input);
    const o = Number(output);
    if (input === '' || output === '' || Number.isNaN(i) || Number.isNaN(o)) return;
    if (price && i === price.input && o === price.output && cur === price.currency) return;
    onChange({ input: i, output: o, currency: cur });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{model}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {providerPreset(provider).label}
          <Badge variant={source === 'custom' ? 'accent' : source === 'none' ? 'warning' : 'secondary'} className="px-1.5 py-0">
            {SOURCE_LABEL[source]}
          </Badge>
          {source === 'fallback' && <span>按 {borrowed} 价格</span>}
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        输入
        <Input className="h-8 w-20 tabular-nums" inputMode="decimal" value={input} placeholder="—" onChange={(e) => setInput(e.target.value)} onBlur={() => commit()} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        输出
        <Input className="h-8 w-20 tabular-nums" inputMode="decimal" value={output} placeholder="—" onChange={(e) => setOutput(e.target.value)} onBlur={() => commit()} />
      </label>
      <SegmentedControl
        size="sm"
        className="w-24"
        value={currency}
        onValueChange={(v) => commit(v)}
        options={[
          { value: 'USD', label: '$' },
          { value: 'CNY', label: '¥' },
        ]}
      />
      <Button variant="ghost" size="icon-sm" className={cn('text-muted-foreground', !onReset && 'invisible')} onClick={onReset} title="恢复内置价格" aria-label="恢复内置价格">
        <RotateCcw />
      </Button>
    </div>
  );
}
