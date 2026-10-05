import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Settings } from '@/lib/settings';

export interface SectionProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

/** 每个设置页的标题区 */
export function PageHeader({ title, description, icon }: { title: string; description?: ReactNode; icon: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-5">{icon}</div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** 一组设置项（卡片），可带小标题 */
export function Group({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      {(title || description) && (
        <div className="px-1">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <Card className="gap-0 divide-y py-0">{children}</Card>
    </section>
  );
}

/** 左边说明、右边控件的一行；control 太宽时自动换到下一行 */
export function Row({ label, description, children, htmlFor, stacked }: { label: ReactNode; description?: ReactNode; children?: ReactNode; htmlFor?: string; stacked?: boolean }) {
  return (
    <div className={cn('flex gap-x-6 gap-y-3 px-5 py-4', stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
        </Label>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children && <div className={cn('shrink-0', stacked ? 'w-full' : 'sm:max-w-[60%]')}>{children}</div>}
    </div>
  );
}

/** 失焦才保存的文本草稿，避免每输一个字都触发页面重新翻译 */
export function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}
