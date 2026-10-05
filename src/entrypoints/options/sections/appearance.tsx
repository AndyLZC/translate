import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { THEMES, type Appearance, type Theme } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { Group, PageHeader, Row, type SectionProps } from '../layout';

const APPEARANCES: { value: Appearance; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: '跟随系统', icon: <Monitor /> },
  { value: 'light', label: '浅色', icon: <Sun /> },
  { value: 'dark', label: '深色', icon: <Moon /> },
];

export function AppearanceSection({ settings, update }: SectionProps) {
  const theme = THEMES.find((t) => t.id === settings.accentTheme) ?? THEMES[0];
  return (
    <>
      <PageHeader icon={<Palette />} title="外观" description="主题色用在设置页、弹窗、悬浮按钮、划词卡片、解析面板和网页上的「[解析]」。每套配色的文字颜色都单独调过，深浅色下都清晰易读。" />
      <div className="space-y-8">
        <Group>
          <Row label="外观" description="设置页、弹窗和网页上的浮层使用浅色还是深色。">
            <SegmentedControl className="sm:w-80" value={settings.appearance} onValueChange={(v) => update({ appearance: v })} options={APPEARANCES} />
          </Row>
        </Group>

        <Group title="主题色">
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ accentTheme: t.id })}
                aria-pressed={settings.accentTheme === t.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm transition-all hover:border-primary/50',
                  settings.accentTheme === t.id && 'border-primary ring-[3px] ring-primary/20',
                )}
              >
                <Swatch theme={t} />
                <span className="flex-1 font-medium">{t.label}</span>
                {settings.accentTheme === t.id && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        </Group>

        <Group title="预览">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Preview theme={theme} mode="light" />
            <Preview theme={theme} mode="dark" />
          </div>
        </Group>
      </div>
    </>
  );
}

/** 色块：左半主色、右半浅色块，一眼看出这套配色的两种用法 */
function Swatch({ theme }: { theme: Theme }) {
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15">
      <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.light.primary} 50%, ${theme.dark.primary} 50%)` }} />
    </span>
  );
}

function Preview({ theme, mode }: { theme: Theme; mode: 'light' | 'dark' }) {
  const c = theme[mode];
  const dark = mode === 'dark';
  const bg = dark ? '#1e1f29' : '#ffffff';
  const fg = dark ? '#ececf3' : '#1d1d2b';
  const body = dark ? '#b4b6c8' : '#4a4a5e';
  return (
    <div className="space-y-3 rounded-xl border p-4 text-sm" style={{ background: bg, color: fg, borderColor: dark ? 'rgba(255,255,255,.1)' : '#e7e7ef' }}>
      <div className="flex items-center justify-between text-xs" style={{ color: body }}>
        <span>{dark ? '深色' : '浅色'}</span>
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: c.accent, color: c.accentFg }}>
          使用中
        </span>
      </div>
      <p className="leading-relaxed">
        The soil is the most important ecosystem of all.{' '}
        <span className="font-semibold" style={{ color: c.link }}>
          [解析]
        </span>
      </p>
      <p className="leading-relaxed" style={{ color: body }}>
        土壤是所有生态系统中最重要的。
      </p>
      <p className="text-xs" style={{ color: body }}>
        <span className="font-semibold" style={{ color: c.link }}>
          主语
        </span>
        ：The soil
      </p>
      <div className="flex gap-2">
        <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: c.primary, color: c.primaryFg }}>
          翻译此页面
        </span>
        <span className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: c.accent, color: c.accentFg }}>
          双语对照
        </span>
      </div>
    </div>
  );
}
