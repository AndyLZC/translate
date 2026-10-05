import { TextCursorInput } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/toggle-group';
import type { Settings } from '@/lib/settings';
import { Group, PageHeader, Row, type SectionProps } from '../layout';
import { LanguageSelect } from '../shared';

const MODES: { value: Settings['selectionMode']; label: string }[] = [
  { value: 'icon', label: '显示图标' },
  { value: 'auto', label: '直接翻译' },
  { value: 'off', label: '关闭' },
];

export function SelectionSection({ settings, update }: SectionProps) {
  return (
    <>
      <PageHeader icon={<TextCursorInput />} title="划词与输入" description="选中文字即可翻译；选中单个单词显示音标、释义和例句。在输入框里连按三下空格翻译自己写的内容。" />
      <div className="space-y-8">
        <Group title="划词翻译">
          <Row label="选中文字后" description="「显示图标」先在选区旁出现一个小图标，点击再翻译；「直接翻译」选中就弹出结果。右键菜单也可以翻译选中内容。">
            <SegmentedControl className="sm:w-72" value={settings.selectionMode} onValueChange={(v) => update({ selectionMode: v })} options={MODES} />
          </Row>
          <Row label="选中的已是目标语言时翻译成" description="例如目标语言是中文，选中中文时就翻译成这里的语言。">
            <LanguageSelect value={settings.secondaryLang} onChange={(v) => update({ secondaryLang: v })} />
          </Row>
        </Group>

        <Group title="输入框翻译" description="在聊天框、评论框、邮件里写完后，快速连按三下空格，整段替换为译文；Ctrl/⌘+Z 可撤销。">
          <Row label="启用">
            <Switch checked={settings.inputEnabled} onCheckedChange={(v) => update({ inputEnabled: v })} />
          </Row>
          <Row label="翻译成">
            <LanguageSelect value={settings.inputTargetLang} onChange={(v) => update({ inputTargetLang: v })} />
          </Row>
        </Group>
      </div>
    </>
  );
}
