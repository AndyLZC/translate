import { getSettings, watchSettings } from '@/lib/settings';
import { YouTubeSubtitles } from '@/youtube/controller';
import './style.css';

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  runAt: 'document_idle',
  allFrames: true,
  async main(ctx) {
    const subtitles = new YouTubeSubtitles(await getSettings());
    subtitles.start();
    const unwatch = watchSettings((s) => subtitles.updateSettings(s));
    ctx.onInvalidated(() => {
      unwatch();
      subtitles.stop();
    });
  },
});
