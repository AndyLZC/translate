import { Captions, MonitorPlay } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Group, PageHeader, Row, type SectionProps } from '../layout';

export function YouTubeSection({ settings, update }: SectionProps) {
  return (
    <>
      <PageHeader icon={<MonitorPlay />} title="YouTube 字幕" description="视频有字幕（含自动生成的字幕）时，在播放器里显示原文 + 译文的双语字幕，全屏可用。" />
      <div className="space-y-8">
        <Group>
          <Row label="双语字幕" description="播放器右下角的「译」按钮也可以随时开关。已经是中文字幕的视频不会叠加。">
            <Switch checked={settings.youtubeEnabled} onCheckedChange={(v) => update({ youtubeEnabled: v })} />
          </Row>
        </Group>
        <Group title="使用技巧">
          <ul className="space-y-2.5 px-5 py-4 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Captions className="mt-0.5 size-4 shrink-0 text-primary" />
              字幕显示方式跟随「翻译 → 显示方式」：双语对照 / 只看译文 / 只看原文（YouTube 原生字幕）。
            </li>
            <li className="flex gap-2">
              <Captions className="mt-0.5 size-4 shrink-0 text-primary" />
              开启学习模式后，点击播放器里的字幕会暂停视频并解析这一句。
            </li>
            <li className="flex gap-2">
              <Captions className="mt-0.5 size-4 shrink-0 text-primary" />
              在 YouTube 视频页打开扩展弹窗，可以把双语字幕导出为 SRT 文件。
            </li>
            <li className="flex gap-2">
              <Captions className="mt-0.5 size-4 shrink-0 text-primary" />
              如果没有出现双语字幕，先点一下播放器自带的字幕（CC）按钮。
            </li>
          </ul>
        </Group>
      </div>
    </>
  );
}
