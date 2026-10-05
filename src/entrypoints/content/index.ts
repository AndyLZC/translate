import { isForeignPage } from '@/lib/language';
import { onMessage, sendMessage } from '@/lib/messaging';
import { getSettings, updateSettings, watchSettings } from '@/lib/settings';
import { hostMatches } from '@/lib/site-rules';
import { AnalysisPanel } from '@/content/analysis-panel';
import { PageTranslator } from '@/content/controller';
import { FloatingButton } from '@/content/floating-button';
import { HoverTranslator } from '@/content/hover-translate';
import { InputTranslator } from '@/content/input-translate';
import { SelectionTranslator } from '@/content/selection';
import { setUiTheme } from '@/content/ui/theme';
import { VocabHighlighter } from '@/content/vocab-highlight';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  // 评论区（Disqus 等）、嵌入的文章常在 iframe 里：子框架也运行，翻译开关跟随顶层页面
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  async main(ctx) {
    if (!document.body || document.contentType !== 'text/html') return;

    const isTop = window === window.top;
    let settings = await getSettings();
    setUiTheme(settings);
    const host = location.hostname;
    const panel = new AnalysisPanel();
    const renderOptions = { onAnalyze: (text: string, translation: string) => void panel.open({ text, translation }) };
    const translator = new PageTranslator(settings, renderOptions);
    const selection = new SelectionTranslator(settings, panel);
    const input = new InputTranslator(settings);
    const hover = new HoverTranslator(settings, () => translator.isEnabled, renderOptions);
    const vocab = new VocabHighlighter(settings);
    selection.start();
    input.start();
    hover.start();
    vocab.start();

    const button = new FloatingButton({
      onToggle: () => translator.toggle(),
      onMode: (mode) => {
        translator.setMode(mode);
        void updateSettings({ displayMode: mode });
      },
      onRetryFailed: () => translator.retryFailed(),
    });
    translator.onStatus((s) => button.update(s));

    const inList = (list: string[]) => list.some((p) => hostMatches(host, p));
    const syncButton = () => {
      if (isTop && settings.showFloatingButton && !inList(settings.neverTranslateSites)) button.mount();
      else button.unmount();
    };
    syncButton();

    const unwatch = watchSettings((s) => {
      settings = s;
      setUiTheme(s);
      translator.updateSettings(s);
      selection.updateSettings(s);
      input.updateSettings(s);
      hover.updateSettings(s);
      vocab.updateSettings(s);
      syncButton();
    });

    if (isTop) {
      onMessage('toggleTranslation', () => {
        translator.toggle();
        return translator.status();
      });
      onMessage('setTranslation', ({ data }) => {
        if (data) translator.start();
        else translator.stop();
        return translator.status();
      });
      onMessage('getStatus', () => translator.status());
      onMessage('exportPage', () => translator.exportMarkdown());
      // 开关变化时通知各个 iframe 跟着开 / 关
      let lastEnabled = translator.isEnabled;
      translator.onStatus((s) => {
        if (s.enabled === lastEnabled) return;
        lastEnabled = s.enabled;
        void sendMessage('frameSync', s.enabled).catch(() => {});
      });
    } else {
      onMessage('syncTranslation', ({ data }) => {
        if (data) translator.start();
        else translator.stop();
      });
    }
    onMessage('translateSelection', () => selection.translateCurrentSelection());
    onMessage('analyzeSelection', () => {
      const text = window.getSelection()?.toString().trim();
      if (text) void panel.open({ text });
    });

    ctx.addEventListener(window, 'wxt:locationchange', () => translator.rescan());
    ctx.onInvalidated(() => {
      unwatch();
      translator.stop();
      selection.stop();
      input.stop();
      hover.stop();
      vocab.stop();
      panel.close();
      button.unmount();
    });

    if (!isTop) {
      // iframe 加载时顶层页面可能已经在翻译了
      if (await sendMessage('frameState').catch(() => false)) translator.start();
    } else if (inList(settings.alwaysTranslateSites)) {
      translator.start();
    } else if (settings.autoTranslateForeign && !inList(settings.neverTranslateSites)) {
      // 等单页应用把正文渲染出来再判断语言
      setTimeout(() => {
        if (!translator.isEnabled && isForeignPage(settings.targetLang)) translator.start();
      }, 1200);
    }
  },
});
