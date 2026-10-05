import { Columns2, FileText, Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TARGET_LANGUAGES, type DisplayMode } from '@/lib/settings';
import { cn } from '@/lib/utils';

export const DISPLAY_MODES: { value: DisplayMode; label: string; icon: React.ReactNode }[] = [
  { value: 'bilingual', label: '双语对照', icon: <Columns2 /> },
  { value: 'translation', label: '只看译文', icon: <Languages /> },
  { value: 'original', label: '只看原文', icon: <FileText /> },
];

export function LanguageSelect({ value, onChange, className, size }: { value: string; onChange: (v: string) => void; className?: string; size?: 'sm' | 'default' }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full sm:w-44', className)} size={size}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TARGET_LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
