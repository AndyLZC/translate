import { isForeignPage } from '@/lib/language';
import { onMessage } from '@/lib/messaging';
import { getSettings, updateSettings, watchSettings } from '@/lib/settings';
import { hostMatches } from '@/lib/site-rules';
import { AnalysisPanel } from '@/content/analysis-panel';
import { PageTranslator } from '@/content/controller';
import { FloatingButton } from '@/content/floating-button';
import { HoverTranslator } from '@/content/hover-translate';
import { InputTranslator } from '@/content/input-translate';
import { SelectionTranslator } from '@/content/selection';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    if (!document.body || document.contentType !== 'text/html') return;

    let settings = await getSettings();
    const host = location.hostname;
    const panel = new AnalysisPanel();
    const renderOptions = { onAnalyze: (text: string, translation: string) => void panel.open({ text, translation }) };
    const translator = new PageTranslator(settings, renderOptions);
    const selection = new SelectionTranslator(settings, panel);
    const input = new InputTranslator(settings);
    const hover = new HoverTranslator(settings, () => translator.isEnabled, renderOptions);
    selection.start();
    input.start();
    hover.start();

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
      if (settings.showFloatingButton && !inList(settings.neverTranslateSites)) button.mount();
      else button.unmount();
    };
    syncButton();

    const unwatch = watchSettings((s) => {
      settings = s;
      translator.updateSettings(s);
      selection.updateSettings(s);
      input.updateSettings(s);
      hover.updateSettings(s);
      syncButton();
    });

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
      panel.close();
      button.unmount();
    });

    if (inList(settings.alwaysTranslateSites)) {
      translator.start();
    } else if (settings.autoTranslateForeign && !inList(settings.neverTranslateSites)) {
      // 等单页应用把正文渲染出来再判断语言
      setTimeout(() => {
        if (!translator.isEnabled && isForeignPage(settings.targetLang)) translator.start();
      }, 1200);
    }
  },
});
