import { onMessage } from '@/lib/messaging';
import { getSettings, updateSettings, watchSettings } from '@/lib/settings';
import { hostMatches } from '@/lib/site-rules';
import { PageTranslator } from '@/content/controller';
import { FloatingButton } from '@/content/floating-button';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    if (!document.body || document.contentType !== 'text/html') return;

    let settings = await getSettings();
    const host = location.hostname;
    const translator = new PageTranslator(settings);

    const button = new FloatingButton({
      onToggle: () => translator.toggle(),
      onMode: (mode) => {
        translator.setMode(mode);
        void updateSettings({ displayMode: mode });
      },
      onRetryFailed: () => translator.retryFailed(),
    });
    translator.onStatus((s) => button.update(s));

    const syncButton = () => {
      const never = settings.neverTranslateSites.some((p) => hostMatches(host, p));
      if (settings.showFloatingButton && !never) button.mount();
      else button.unmount();
    };
    syncButton();

    const unwatch = watchSettings((s) => {
      settings = s;
      translator.updateSettings(s);
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

    ctx.addEventListener(window, 'wxt:locationchange', () => translator.rescan());
    ctx.onInvalidated(() => {
      unwatch();
      translator.stop();
      button.unmount();
    });

    if (settings.alwaysTranslateSites.some((p) => hostMatches(host, p))) translator.start();
  },
});
