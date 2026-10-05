import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** 分段选择器（单选），shadcn ToggleGroup 的胶囊样式变体 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'default',
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }[];
  className?: string;
  size?: 'sm' | 'default';
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex w-full items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/60',
            size === 'sm' ? 'h-7 px-2 text-xs [&_svg]:size-3.5' : 'h-8 px-3 text-sm [&_svg]:size-4',
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export { SegmentedControl };
