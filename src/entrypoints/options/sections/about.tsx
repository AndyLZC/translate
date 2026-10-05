import { Info, Keyboard, Smartphone } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Group, PageHeader } from '../layout';

const SHORTCUTS: [string, string][] = [
  ['Alt + A', '翻译 / 还原当前页面'],
  ['Alt + S', '切换显示方式（双语 → 只看译文 → 只看原文）'],
  ['选中文字', '划词翻译（单个单词显示词典释义）'],
  ['Ctrl（悬停在段落上单独按一下）', '只翻译这一段'],
  ['输入框里连按三下空格', '把已输入内容翻译成设定语言'],
  ['Esc', '关闭划词卡片 / 解析面板'],
];

export function AboutSection() {
  const isFirefox = navigator.userAgent.includes('Firefox');
  return (
    <>
      <PageHeader icon={<Info />} title="帮助" description={`AI 双语翻译 v${browser.runtime.getManifest().version}`} />
      <div className="space-y-8">
        <Group title="快捷操作">
          <div className="divide-y">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-muted-foreground">{v}</span>
                <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs whitespace-nowrap">{k}</kbd>
              </div>
            ))}
          </div>
          {!isFirefox && (
            <div className="px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
                <Keyboard />
                修改快捷键
              </Button>
            </div>
          )}
        </Group>

        <Group title="手机上使用">
          <div className="space-y-2.5 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            <p className="flex gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b className="text-foreground">Android：</b>Firefox for Android 支持扩展（需要从 Firefox 附加组件网站安装，或用 Firefox Nightly 的自定义附加组件集合）；
                Microsoft Edge Android 版只能装 Edge 商店里的扩展；部分第三方 Chromium 浏览器（如 Lemur）可以装 Chrome 扩展，但没有经过测试。手机版 Chrome 不支持扩展。
              </span>
            </p>
            <p className="flex gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b className="text-foreground">iPhone / iPad：</b>Safari 扩展需要在 Mac 上用 Xcode 打包成 App 才能安装。
              </span>
            </p>
            <p>插件已适配触屏：长按选词即可划词翻译，解析面板在手机上是底部弹层，悬浮按钮更大更好点。</p>
          </div>
        </Group>
      </div>
    </>
  );
}
