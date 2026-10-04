import { FROM_PAGE, TO_PAGE, type CaptionTrackInfo, type ExtMessage, type PageMessage, type WithoutSource } from '@/youtube/bridge';

/**
 * 运行在页面自己的 JS 环境（MAIN world）。
 * 普通内容脚本在隔离环境里，拦截不到 YouTube 播放器自己发出的字幕请求；
 * 这里包一层 fetch / XMLHttpRequest，把 /api/timedtext 的响应转发给内容脚本。
 * 自己去请求字幕地址会因为缺少播放器生成的令牌而失败，所以只能拦截。
 */
export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://www.youtube-nocookie.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  main() {
    const isTimedText = (url: string) => url.includes('/api/timedtext');
    /** 最近拦截到的字幕，内容脚本晚于请求加载时用来补发 */
    const recent: { url: string; text: string }[] = [];

    const post = (msg: WithoutSource<PageMessage>) =>
      window.postMessage({ source: FROM_PAGE, ...msg } as PageMessage, location.origin);

    const capture = (url: string, text: string) => {
      if (!text) return;
      recent.push({ url, text });
      if (recent.length > 8) recent.shift();
      post({ type: 'timedtext', url, text });
    };

    const origFetch = window.fetch;
    window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
      const res = await origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (isTimedText(url) && res.ok) {
          void res
            .clone()
            .text()
            .then((t) => capture(res.url || url, t))
            .catch(() => {});
        }
      } catch {
        /* 不影响页面 */
      }
      return res;
    } as typeof fetch;

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const urls = new WeakMap<XMLHttpRequest, string>();
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      urls.set(this, String(args[1]));
      return (origOpen as (...a: unknown[]) => void).apply(this, args);
    } as typeof XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      const url = urls.get(this) ?? '';
      if (isTimedText(url)) {
        this.addEventListener('load', () => {
          if (this.status !== 200) return;
          try {
            let text = '';
            if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
            else if (this.responseType === 'json') text = JSON.stringify(this.response);
            else if (this.responseType === 'arraybuffer') text = new TextDecoder().decode(this.response as ArrayBuffer);
            capture(this.responseURL || url, text);
          } catch {
            /* 不影响页面 */
          }
        });
      }
      return (origSend as (...a: unknown[]) => void).apply(this, args);
    };

    // ---------- 播放器操作（YouTube 未公开的播放器方法，全部做存在性检查） ----------
    interface Player extends HTMLElement {
      getPlayerResponse?: () => {
        videoDetails?: { videoId?: string };
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackInfo[] } };
      };
      getOption?: (module: string, option: string) => unknown;
      setOption?: (module: string, option: string, value: unknown) => void;
      loadModule?: (module: string) => void;
      toggleSubtitlesOn?: () => void;
    }
    const player = () => document.getElementById('movie_player') as Player | null;

    const tracksOf = (p: Player): { videoId: string; tracks: CaptionTrackInfo[] } => {
      const resp = p.getPlayerResponse?.();
      const tracks = (resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).map((t) => ({
        languageCode: t.languageCode,
        kind: t.kind,
        name: typeof t.name === 'object' ? (t.name as { simpleText?: string })?.simpleText : t.name,
      }));
      return { videoId: resp?.videoDetails?.videoId ?? '', tracks };
    };

    const activeTrack = (p: Player) => {
      try {
        const t = p.getOption?.('captions', 'track') as { languageCode?: string } | undefined;
        return t?.languageCode ?? '';
      } catch {
        return '';
      }
    };

    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      const msg = e.data as ExtMessage;
      if (msg?.source !== TO_PAGE) return;
      const p = player();

      if (msg.type === 'hello') {
        recent.forEach((r) => post({ type: 'timedtext', url: r.url, text: r.text }));
      } else if (msg.type === 'getTracks' && p) {
        post({ type: 'tracks', ...tracksOf(p), active: activeTrack(p) });
      } else if (msg.type === 'enableCaptions' && p) {
        if (activeTrack(p)) return; // 已经开着字幕
        const { tracks } = tracksOf(p);
        const notTarget = (t: CaptionTrackInfo) => !t.languageCode.startsWith(msg.avoidLang);
        const pick =
          tracks.find((t) => t.kind !== 'asr' && notTarget(t)) ?? tracks.find(notTarget) ?? tracks[0];
        try {
          p.loadModule?.('captions');
          if (pick && p.setOption) p.setOption('captions', 'track', { languageCode: pick.languageCode, kind: pick.kind });
          else p.toggleSubtitlesOn?.();
        } catch {
          p.toggleSubtitlesOn?.();
        }
      }
    });
  },
});
