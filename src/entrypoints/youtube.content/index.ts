import { getSettings, watchSettings } from '@/lib/settings';
import { setUiTheme } from '@/content/ui/theme';
import { YouTubeSubtitles } from '@/youtube/controller';
import './style.css';

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  runAt: 'document_idle',
  allFrames: true,
  async main(ctx) {
    const settings = await getSettings();
    setUiTheme(settings);
    const subtitles = new YouTubeSubtitles(settings);
    subtitles.start();
    const unwatch = watchSettings((s) => {
      setUiTheme(s);
      subtitles.updateSettings(s);
    });
    ctx.onInvalidated(() => {
      unwatch();
      subtitles.stop();
    });
  },
});
