import { useEffect, useState, type ReactNode } from 'react';
import { Bot, ChartColumn, DatabaseBackup, Globe, GraduationCap, Info, Languages, MonitorPlay, Palette, TextCursorInput } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettings } from '@/lib/use-settings';
import { cn } from '@/lib/utils';
import { AboutSection } from './sections/about';
import { AppearanceSection } from './sections/appearance';
import { DataSection } from './sections/data';
import { LearningSection } from './sections/learning';
import { ModelsSection } from './sections/models';
import { SelectionSection } from './sections/selection';
import { TranslateSection } from './sections/translate';
import { UsageSection } from './sections/usage';
import { WebSection } from './sections/web';
import { YouTubeSection } from './sections/youtube';

const NAV = [
  { id: 'models', label: '模型服务', icon: <Bot /> },
  { id: 'translate', label: '翻译', icon: <Languages /> },
  { id: 'web', label: '网页翻译', icon: <Globe /> },
  { id: 'selection', label: '划词与输入', icon: <TextCursorInput /> },
  { id: 'learning', label: '学习', icon: <GraduationCap /> },
  { id: 'youtube', label: 'YouTube', icon: <MonitorPlay /> },
  { id: 'appearance', label: '外观', icon: <Palette /> },
  { id: 'usage', label: '用量与费用', icon: <ChartColumn /> },
  { id: 'data', label: '数据与备份', icon: <DatabaseBackup /> },
  { id: 'about', label: '帮助', icon: <Info /> },
] as const;
type SectionId = (typeof NAV)[number]['id'];

const initialSection = (): SectionId => {
  const h = location.hash.slice(1);
  return (NAV.find((n) => n.id === h)?.id ?? 'models') as SectionId;
};

export default function App() {
  const [settings, update] = useSettings();
  const [section, setSection] = useState<SectionId>(initialSection);

  useEffect(() => {
    const onHash = () => setSection(initialSection());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: SectionId) => {
    history.replaceState(null, '', `#${id}`);
    setSection(id);
    window.scrollTo({ top: 0 });
  };

  if (!settings) return null;
  const props = { settings, update };
  const content: Record<SectionId, ReactNode> = {
    models: <ModelsSection {...props} />,
    translate: <TranslateSection {...props} />,
    web: <WebSection {...props} />,
    selection: <SelectionSection {...props} />,
    learning: <LearningSection {...props} />,
    youtube: <YouTubeSection {...props} />,
    appearance: <AppearanceSection {...props} />,
    usage: <UsageSection {...props} />,
    data: <DataSection {...props} />,
    about: <AboutSection />,
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* 桌面：左侧导航 */}
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card/60 px-3 py-5 backdrop-blur md:flex">
          <Brand />
          <nav className="mt-6 grid gap-0.5">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => go(n.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [&_svg]:size-4',
                  section === n.id && 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
          <p className="mt-auto px-3 text-xs text-muted-foreground">修改后自动保存，已打开的页面立即生效。</p>
        </aside>

        {/* 手机 / 窄屏：顶部横向导航 */}
        <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur md:hidden">
          <div className="px-4 pt-4">
            <Brand />
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2.5 [scrollbar-width:none]">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => go(n.id)}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground [&_svg]:size-3.5',
                  section === n.id && 'bg-primary text-primary-foreground',
                )}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="md:pl-60">
          <div className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">{content[section]}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/icon/48.png" className="size-8 rounded-lg" alt="" />
      <div>
        <div className="text-sm leading-tight font-semibold">AI 双语翻译</div>
        <div className="text-xs text-muted-foreground">设置</div>
      </div>
    </div>
  );
}
