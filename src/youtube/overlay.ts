const CSS = `
:host { all: initial; position: absolute; left: 0; right: 0; bottom: var(--tx-bottom, 7%); z-index: 45;
  display: flex; justify-content: center; pointer-events: none; transition: bottom .15s; }
.box { max-width: 82%; background: rgba(8, 8, 8, .74); border-radius: 6px; padding: .2em .65em .3em; text-align: center;
  line-height: 1.35; font-family: "YouTube Noto", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  pointer-events: auto; user-select: text; }
.box[hidden] { display: none; }
.orig { color: #e8e8e8; font-size: calc(var(--tx-fs, 20px) * .8); }
.tr { color: #fff; font-size: var(--tx-fs, 20px); font-weight: 500; }
.tr.pending { opacity: .55; font-size: calc(var(--tx-fs, 20px) * .7); }
.tr.error { color: #ffb4a8; font-size: calc(var(--tx-fs, 20px) * .65); }
.box.learn { cursor: pointer; }
.box.learn:hover { background: rgba(8, 8, 8, .86); }
.box.learn:hover .orig { text-decoration: underline dotted rgba(255,255,255,.6); text-underline-offset: 3px; }
.line[hidden] { display: none; }
`;

export interface OverlayContent {
  original: string;
  translation: string | null;
  /** loading：翻译中；error：失败（translation 里是原因） */
  state: 'loading' | 'done' | 'error';
  showOriginal: boolean;
}

/** 画在播放器内部的双语字幕，放在 Shadow DOM 里；全屏时跟着播放器一起放大 */
export class SubtitleOverlay {
  private host = document.createElement('tx-subtitle');
  private box = document.createElement('div');
  private orig = document.createElement('div');
  private tr = document.createElement('div');
  private resize = new ResizeObserver(([e]) => this.fit(e.contentRect.height));
  private player: HTMLElement | null = null;
  private last = '';
  /** 学习模式：点字幕打开解析 */
  onClick: (() => void) | null = null;

  constructor() {
    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.box.className = 'box';
    this.orig.className = 'line orig';
    this.tr.className = 'line tr';
    this.box.append(this.orig, this.tr);
    this.box.hidden = true;
    this.box.addEventListener('click', (e) => {
      if (!this.onClick) return;
      e.stopPropagation(); // 不触发播放器的暂停/播放
      this.onClick();
    });
    // 播放器在 mousedown 时就会处理，拦掉避免误触
    this.box.addEventListener('mousedown', (e) => this.onClick && e.stopPropagation());
    shadow.append(style, this.box);
  }

  attach(player: HTMLElement) {
    if (this.player !== player) {
      this.resize.disconnect();
      this.player = player;
      this.resize.observe(player);
      this.fit(player.clientHeight);
    }
    if (this.host.parentNode !== player) player.appendChild(this.host);
    // 控制栏显示时把字幕往上抬，避免挡住进度条
    const controlsShown = !player.classList.contains('ytp-autohide');
    this.host.style.setProperty('--tx-bottom', controlsShown ? 'calc(4% + 56px)' : '5%');
  }

  private fit(height: number) {
    const fs = Math.max(14, Math.min(40, height * 0.042));
    this.host.style.setProperty('--tx-fs', `${fs.toFixed(1)}px`);
  }

  show(c: OverlayContent) {
    const key = JSON.stringify(c);
    if (key === this.last && !this.box.hidden) return;
    this.last = key;
    this.orig.textContent = c.original;
    this.orig.hidden = !c.showOriginal && c.state === 'done';
    this.tr.className = `line tr ${c.state === 'done' ? '' : c.state === 'loading' ? 'pending' : 'error'}`;
    this.tr.textContent = c.state === 'loading' ? '翻译中…' : c.state === 'error' ? `⚠ ${c.translation ?? '翻译失败'}` : c.translation ?? '';
    this.box.classList.toggle('learn', !!this.onClick);
    this.box.title = this.onClick ? '点击暂停并解析这句' : '';
    this.box.hidden = false;
  }

  hide() {
    this.box.hidden = true;
    this.last = '';
  }

  detach() {
    this.resize.disconnect();
    this.host.remove();
    this.player = null;
  }
}
