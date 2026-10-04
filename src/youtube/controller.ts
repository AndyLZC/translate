import { sendMessage } from '@/lib/messaging';
import { updateSettings, type Settings } from '@/lib/settings';
import { escapeText, stripPlaceholders } from '@/content/serializer';
import { FROM_PAGE, TO_PAGE, type ExtMessage, type PageMessage, type WithoutSource } from './bridge';
import { SubtitleOverlay } from './overlay';
import { currentVideoId, findSentenceIndex, parseTimedText, segment, trackInfo, type Sentence } from './subtitles';

const CHUNK = 40;
const RETRY_AFTER_MS = 20_000;
const VIDEO_EVENTS = ['timeupdate', 'seeked', 'seeking', 'play', 'pause'] as const;

interface Chunk {
  from: number;
  to: number; // 不含
  state: 'pending' | 'loading' | 'done' | 'error';
  error?: string;
  triedAt: number;
}

interface Line extends Sentence {
  translation?: string;
}

/**
 * YouTube 双语字幕：
 * 拦截到播放器的字幕 → 断句 → 从当前播放位置开始分批翻译 → 按播放进度显示在播放器上。
 */
export class YouTubeSubtitles {
  private enabled: boolean;
  private videoId = '';
  private trackKey = '';
  private lines: Line[] = [];
  private chunks: Chunk[] = [];
  private generation = 0;
  private overlay = new SubtitleOverlay();
  private raf = 0;
  private lastHref = '';
  private button: HTMLButtonElement | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private autoRequested = '';
  private boundVideo: HTMLVideoElement | null = null;

  constructor(private settings: Settings) {
    this.enabled = settings.youtubeEnabled;
  }

  start() {
    window.addEventListener('message', this.onMessage);
    document.addEventListener('yt-navigate-finish', this.onNavigate);
    this.lastHref = location.href;
    this.videoId = currentVideoId();
    this.post({ type: 'hello' });
    // 单页应用换视频、控制栏重绘：低频检查即可
    this.timers.push(
      setInterval(() => {
        if (location.href !== this.lastHref) this.onNavigate();
        this.ensureButton();
        this.maybeAutoEnable();
      }, 1000),
      // 后台标签页、部分全屏场景下 requestAnimationFrame 会暂停，用定时器兜底
      setInterval(() => this.render(), 250),
    );
    this.loop();
  }

  stop() {
    window.removeEventListener('message', this.onMessage);
    document.removeEventListener('yt-navigate-finish', this.onNavigate);
    this.timers.forEach(clearInterval);
    cancelAnimationFrame(this.raf);
    this.bindVideo(null);
    this.overlay.detach();
    this.button?.remove();
    this.player()?.removeAttribute('data-tx-subs');
  }

  updateSettings(s: Settings) {
    const old = this.settings;
    this.settings = s;
    if (s.youtubeEnabled !== this.enabled) this.setEnabled(s.youtubeEnabled, false);
    const retranslate =
      old.targetLang !== s.targetLang ||
      old.activeProvider !== s.activeProvider ||
      old.providers[old.activeProvider].model !== s.providers[s.activeProvider].model ||
      old.customPrompt !== s.customPrompt ||
      old.glossary !== s.glossary;
    if (retranslate && this.lines.length) {
      this.lines.forEach((l) => delete l.translation);
      this.resetChunks();
      this.translateFromCurrent();
    }
  }

  private setEnabled(on: boolean, persist: boolean) {
    this.enabled = on;
    this.updateButton();
    if (persist) {
      // 写入设置：其他标签页、设置页同步
      void updateSettings({ youtubeEnabled: on });
    }
    if (on) {
      if (this.lines.length) this.translateFromCurrent();
      else this.requestCaptions();
    }
  }

  // ---------- 与页面脚本通信 ----------

  private post(msg: WithoutSource<ExtMessage>) {
    window.postMessage({ source: TO_PAGE, ...msg } as ExtMessage, location.origin);
  }

  private onMessage = (e: MessageEvent) => {
    if (e.source !== window) return;
    const msg = e.data as PageMessage;
    if (msg?.source !== FROM_PAGE || msg.type !== 'timedtext') return;
    if (typeof msg.url !== 'string' || typeof msg.text !== 'string') return;
    this.onTimedText(msg.url, msg.text);
  };

  private targetBase() {
    return this.settings.targetLang.split('-')[0].toLowerCase();
  }

  private onTimedText(url: string, text: string) {
    const info = trackInfo(url);
    const vid = currentVideoId();
    if (info.videoId && vid && info.videoId !== vid) return; // 首页预览等别的视频
    const key = `${info.videoId}|${info.lang}|${info.asr}|${info.tlang}`;
    if (key === this.trackKey) return;

    // 已经是目标语言（或用了 YouTube 自带翻译）：不叠加，直接用原生字幕
    const lang = (info.tlang || info.lang).toLowerCase();
    if (lang && lang.split('-')[0] === this.targetBase()) {
      this.clearTrack();
      this.trackKey = key;
      return;
    }

    let lines: Line[];
    try {
      lines = segment(parseTimedText(text, url));
    } catch (err) {
      console.warn('[ai-translate] 字幕解析失败', err);
      return;
    }
    if (!lines.length) return;

    this.clearTrack();
    this.trackKey = key;
    this.videoId = vid || info.videoId;
    this.lines = lines;
    this.resetChunks();
    if (this.enabled) this.translateFromCurrent();
  }

  private clearTrack() {
    this.generation++;
    this.lines = [];
    this.chunks = [];
    this.trackKey = '';
    this.overlay.hide();
  }

  private onNavigate = () => {
    this.lastHref = location.href;
    const vid = currentVideoId();
    if (vid === this.videoId) return;
    this.videoId = vid;
    this.clearTrack();
    this.autoRequested = '';
  };

  /** 开着双语字幕但播放器字幕没打开时，帮用户打开（只在有非目标语言字幕时） */
  private maybeAutoEnable() {
    if (!this.enabled || this.lines.length || this.trackKey || !this.videoId) return;
    if (this.autoRequested === this.videoId || !this.player()) return;
    this.autoRequested = this.videoId;
    this.requestCaptions();
  }

  private requestCaptions() {
    this.post({ type: 'enableCaptions', avoidLang: this.targetBase() });
  }

  // ---------- 翻译 ----------

  private resetChunks() {
    this.chunks = [];
    for (let i = 0; i < this.lines.length; i += CHUNK) {
      this.chunks.push({ from: i, to: Math.min(i + CHUNK, this.lines.length), state: 'pending', triedAt: 0 });
    }
  }

  /** 先翻当前播放位置所在的批次，再往后，最后补前面的 */
  private translateFromCurrent() {
    if (!this.enabled || !this.chunks.length) return;
    const t = this.currentTimeMs();
    let idx = this.lines.findIndex((l) => l.end > t);
    if (idx < 0) idx = 0;
    const first = Math.floor(idx / CHUNK);
    const order = [...this.chunks.slice(first), ...this.chunks.slice(0, first).reverse()];
    for (const c of order) if (c.state === 'pending') void this.translateChunk(c);
  }

  private async translateChunk(chunk: Chunk) {
    const gen = this.generation;
    chunk.state = 'loading';
    chunk.triedAt = Date.now();
    const lines = this.lines.slice(chunk.from, chunk.to);
    try {
      const res = await sendMessage('translate', {
        texts: lines.map((l) => escapeText(l.text)),
        context: { title: document.title.replace(/ - YouTube$/, ''), url: location.href },
        kind: 'subtitle',
      });
      if (gen !== this.generation) return;
      res.translations.forEach((t, i) => {
        if (t != null) lines[i].translation = stripPlaceholders(t);
      });
      const missing = res.translations.some((t) => t == null);
      chunk.state = missing ? 'error' : 'done';
      chunk.error = missing ? res.error || '翻译失败' : undefined;
    } catch (e) {
      if (gen !== this.generation) return;
      chunk.state = 'error';
      chunk.error = /context invalidated|Receiving end/i.test(String(e))
        ? '插件刚更新过，请刷新页面'
        : e instanceof Error
          ? e.message
          : String(e);
    }
  }

  // ---------- 显示 ----------

  private player(): HTMLElement | null {
    return document.getElementById('movie_player') ?? document.querySelector('.html5-video-player');
  }

  private video(): HTMLVideoElement | null {
    return this.player()?.querySelector('video') ?? null;
  }

  private currentTimeMs() {
    return (this.video()?.currentTime ?? 0) * 1000;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.render();
  };

  /** 跳转、暂停等时刻立即刷新，不等下一帧 */
  private bindVideo(video: HTMLVideoElement | null) {
    if (video === this.boundVideo) return;
    for (const ev of VIDEO_EVENTS) this.boundVideo?.removeEventListener(ev, this.onVideoEvent);
    this.boundVideo = video;
    for (const ev of VIDEO_EVENTS) video?.addEventListener(ev, this.onVideoEvent);
  }

  private onVideoEvent = () => this.render();

  private render() {
    this.bindVideo(this.video());
    const player = this.player();
    const active = this.enabled && this.lines.length > 0 && this.settings.displayMode !== 'original' && !!player;
    if (!active || !player) {
      player?.removeAttribute('data-tx-subs');
      this.overlay.hide();
      return;
    }
    // 隐藏原生字幕（样式见 youtube.css），由插件的双语字幕代替
    if (!player.hasAttribute('data-tx-subs')) player.setAttribute('data-tx-subs', '');
    this.overlay.attach(player);

    const t = this.currentTimeMs();
    const idx = findSentenceIndex(this.lines, t);
    if (idx < 0) return this.overlay.hide();
    const line = this.lines[idx];
    const chunk = this.chunks[Math.floor(idx / CHUNK)];

    if (chunk?.state === 'error' && Date.now() - chunk.triedAt > RETRY_AFTER_MS) {
      chunk.state = 'pending';
      void this.translateChunk(chunk);
    }

    this.overlay.show({
      original: line.text,
      translation: line.translation ?? (chunk?.state === 'error' ? chunk.error ?? null : null),
      state: line.translation != null ? 'done' : chunk?.state === 'error' ? 'error' : 'loading',
      showOriginal: this.settings.displayMode === 'bilingual',
    });
  }

  // ---------- 播放器上的开关按钮 ----------

  private ensureButton() {
    const controls = document.querySelector('#movie_player .ytp-right-controls, .html5-video-player .ytp-right-controls');
    if (!controls) return;
    if (this.button?.parentNode === controls) return;
    const btn = this.button ?? this.createButton();
    controls.prepend(btn);
  }

  private createButton() {
    const btn = document.createElement('button');
    btn.className = 'ytp-button tx-yt-btn';
    btn.innerHTML =
      '<svg viewBox="0 0 36 36" width="100%" height="100%"><text x="18" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" font-family="PingFang SC, Microsoft YaHei, sans-serif">译</text></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setEnabled(!this.enabled, true);
    });
    this.button = btn;
    this.updateButton();
    return btn;
  }

  private updateButton() {
    if (!this.button) return;
    this.button.setAttribute('aria-pressed', String(this.enabled));
    const label = this.enabled ? '关闭双语字幕' : '开启双语字幕';
    this.button.title = label;
    this.button.setAttribute('aria-label', label);
  }
}
