import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/** 少量 shadcn 风格的基础组件（不引入 Radix，保持扩展体积小） */

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-muted)]',
  ghost: 'hover:bg-[var(--bg-muted)]',
  danger: 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950',
};

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...p}
    />
  );
}

const field =
  'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-9', className)} {...p} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'py-2 font-mono text-[13px] leading-relaxed', className)} {...p} />;
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, 'h-9', className)} {...p} />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-600',
      )}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg bg-[var(--bg-muted)] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-[var(--bg)] shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[var(--fg-muted)]">{hint}</span>}
    </label>
  );
}

export function Card({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
