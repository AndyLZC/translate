import { useEffect, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Card } from '@/components/ui/card';
import { dayKey, USAGE_KEY, type UsageData, type UsageEntry } from '@/background/usage';
import { Group, PageHeader } from '../layout';

const fmt = (n: number) => n.toLocaleString();

function sum(entries: UsageEntry[]): UsageEntry {
  return entries.reduce(
    (a, b) => ({ requests: a.requests + b.requests, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, chars: a.chars + b.chars }),
    { requests: 0, inputTokens: 0, outputTokens: 0, chars: 0 },
  );
}

export function UsageSection() {
  const [data, setData] = useState<UsageData>({});
  useEffect(() => {
    const load = () => browser.storage.local.get(USAGE_KEY).then((r) => setData((r[USAGE_KEY] as UsageData) ?? {}));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const days = Object.keys(data).sort().reverse();
  const today = sum(Object.values(data[dayKey()] ?? {}));
  const last30 = sum(days.slice(0, 30).flatMap((d) => Object.values(data[d])));
  const rows = days.slice(0, 30).flatMap((d) => Object.entries(data[d]).map(([model, e]) => ({ day: d, model, ...e })));

  return (
    <>
      <PageHeader icon={<ChartColumn />} title="用量" description="插件实际发给模型的请求和 token 数（命中缓存的不计）。费用以服务商账单为准。" />
      <div className="space-y-8">
        <Group>
          <div className="grid divide-y text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-4">
              <div className="text-muted-foreground">今天</div>
              <div className="mt-1">
                {fmt(today.requests)} 次请求 · 输入 {fmt(today.inputTokens)} / 输出 {fmt(today.outputTokens)} token
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-muted-foreground">最近 30 天</div>
              <div className="mt-1">
                {fmt(last30.requests)} 次请求 · 输入 {fmt(last30.inputTokens)} / 输出 {fmt(last30.outputTokens)} token
              </div>
            </div>
          </div>
        </Group>

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
                    <th className="px-5 py-2.5 text-right font-medium">输出 token</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.day + r.model}>
                      <td className="px-5 py-2.5 whitespace-nowrap">{r.day}</td>
                      <td className="px-3 py-2.5">{r.model}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.requests)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.inputTokens)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{fmt(r.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Card className="border-0 py-8 text-center text-sm text-muted-foreground shadow-none">还没有用量记录</Card>
          )}
        </Group>
      </div>
    </>
  );
}
