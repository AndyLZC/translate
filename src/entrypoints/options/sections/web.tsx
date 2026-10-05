import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Settings } from '@/lib/settings';
import { BUILTIN_SITE_RULES, parseCustomRules } from '@/lib/site-rules';
import { Group, PageHeader, Row, useDraft, type SectionProps } from '../layout';

const HOVER_KEYS: { value: Settings['hoverKey']; label: string }[] = [
  { value: 'Control', label: 'Ctrl' },
  { value: 'Alt', label: 'Alt / Option' },
  { value: 'Shift', label: 'Shift' },
  { value: 'off', label: '关闭' },
];

const toList = (s: string) => [...new Set(s.split(/[\n,\s]+/).map((x) => x.trim()).filter(Boolean))];

export function WebSection({ settings, update }: SectionProps) {
  const [always, setAlways] = useDraft(settings.alwaysTranslateSites.join('\n'));
  const [never, setNever] = useDraft(settings.neverTranslateSites.join('\n'));
  const [rules, setRules] = useDraft(settings.customSiteRules);
  const [ruleError, setRuleError] = useState('');

  return (
    <>
      <PageHeader icon={<Globe />} title="网页翻译" description="整页双语翻译的触发方式、网站名单和站点规则。快捷键 Alt+A 翻译 / 还原当前页面。" />
      <div className="space-y-8">
        <Group>
          <Row label="自动翻译外语网页" description="打开不是目标语言的网页时自动翻译。会消耗更多 token，默认关闭。">
            <Switch checked={settings.autoTranslateForeign} onCheckedChange={(v) => update({ autoTranslateForeign: v })} />
          </Row>
          <Row label="显示悬浮按钮" description="页面右下角的「译」按钮，可一键翻译、切换显示方式。">
            <Switch checked={settings.showFloatingButton} onCheckedChange={(v) => update({ showFloatingButton: v })} />
          </Row>
          <Row label="悬停翻译" description="鼠标停在某一段上，单独按一下这个键，只翻译这一段；再按一次收起。">
            <Select value={settings.hoverKey} onValueChange={(v) => update({ hoverKey: v as Settings['hoverKey'] })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOVER_KEYS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Group>

        <Group title="网站名单" description="每行一个域名，包含子域名。">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              总是翻译
              <Textarea rows={5} placeholder="news.ycombinator.com" value={always} onChange={(e) => setAlways(e.target.value)} onBlur={() => update({ alwaysTranslateSites: toList(always) })} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              不自动翻译、隐藏悬浮按钮
              <Textarea rows={5} placeholder="mail.google.com" value={never} onChange={(e) => setNever(e.target.value)} onBlur={() => update({ neverTranslateSites: toList(never) })} />
            </label>
          </div>
        </Group>

        <Group
          title="自定义站点规则（JSON）"
          description={
            <>
              与内置规则同名（name）时覆盖内置规则。字段：matches 域名、blocks 强制整段翻译的选择器、exclude 不翻译的选择器、roots 只翻译这些容器。内置：
              {BUILTIN_SITE_RULES.map((r) => r.name).join('、')}。
            </>
          }
        >
          <div className="space-y-2 p-4">
            <Textarea
              rows={7}
              className="font-mono text-[13px]"
              aria-invalid={!!ruleError}
              placeholder={JSON.stringify([{ name: 'example', matches: ['example.com'], blocks: ['.post-title'], exclude: ['.sidebar'] }], null, 2)}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              onBlur={() => {
                try {
                  parseCustomRules(rules);
                  setRuleError('');
                  void update({ customSiteRules: rules });
                } catch (e) {
                  setRuleError(`没有保存：${e instanceof Error ? e.message : String(e)}`);
                }
              }}
            />
            {ruleError && <p className="text-sm text-destructive">{ruleError}</p>}
          </div>
        </Group>
      </div>
    </>
  );
}
