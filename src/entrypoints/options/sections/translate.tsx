import { Languages } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import type { TranslationTheme } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Group, PageHeader, Row, useDraft, type SectionProps } from '../layout';
import { DISPLAY_MODES, LanguageSelect } from '../shared';

const THEMES: { value: TranslationTheme; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'underline', label: '虚线' },
  { value: 'dim', label: '淡色' },
  { value: 'highlight', label: '高亮' },
  { value: 'italic', label: '斜体' },
];

const THEME_CLASS: Record<TranslationTheme, string> = {
  none: '',
  underline: 'underline decoration-dashed decoration-muted-foreground/60 underline-offset-4',
  dim: 'opacity-70',
  highlight: 'bg-amber-300/30 rounded-sm box-decoration-clone',
  italic: 'italic',
};

export function TranslateSection({ settings, update }: SectionProps) {
  const [prompt, setPrompt] = useDraft(settings.customPrompt);
  const [glossary, setGlossary] = useDraft(settings.glossary);

  return (
    <>
      <PageHeader icon={<Languages />} title="翻译" description="目标语言、译文的显示方式和样式，以及术语表、额外要求。" />

      <div className="space-y-8">
        <Group>
          <Row label="目标语言" description="网页、字幕、划词都翻译成这个语言。">
            <LanguageSelect value={settings.targetLang} onChange={(v) => update({ targetLang: v })} />
          </Row>
          <Row label="显示方式" description="「只看译文」只对整段生效，段落中夹杂的零散文字仍是双语显示。">
            <SegmentedControl className="sm:w-80" value={settings.displayMode} onValueChange={(v) => update({ displayMode: v })} options={DISPLAY_MODES} />
          </Row>
          <Row label="译文样式" stacked>
            <SegmentedControl value={settings.theme} onValueChange={(v) => update({ theme: v })} options={THEMES} />
            <div className="mt-3 rounded-lg border bg-background p-4 text-sm leading-relaxed">
              <p>The quick brown fox jumps over the lazy dog.</p>
              <p className="mt-1.5">
                <span className={cn(THEME_CLASS[settings.theme])}>敏捷的棕色狐狸跳过了那只懒狗。</span>
              </p>
            </div>
          </Row>
        </Group>

        <Group title="术语表" description="每行一条，格式「原文=译文」，以 # 开头的行会被忽略。翻译时会严格使用这些译法。">
          <div className="p-4">
            <Textarea
              rows={5}
              className="font-mono text-[13px]"
              placeholder={'Agent=智能体\nprompt=提示词\n# 这是注释'}
              value={glossary}
              onChange={(e) => setGlossary(e.target.value)}
              onBlur={() => update({ glossary })}
            />
          </div>
        </Group>

        <Group title="额外要求" description="会追加到提示词末尾，例如翻译风格、专业领域。">
          <div className="p-4">
            <Textarea
              rows={3}
              placeholder="例如：这是技术文档，术语保留英文并在首次出现时用括号注明中文。"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => update({ customPrompt: prompt })}
            />
          </div>
        </Group>
      </div>
    </>
  );
}
