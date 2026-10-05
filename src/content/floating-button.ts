import { browser } from 'wxt/browser';
import type { PageStatus } from '@/lib/messaging';
import type { DisplayMode } from '@/lib/settings';
import { darkRules, registerThemedHost } from './ui/theme';

const MODES: { mode: DisplayMode; label: string }[] = [
  { mode: 'bilingual', label: '双语' },
  { mode: 'translation', label: '译文' },
  { mode: 'original', label: '原文' },
];

const svg = (body: string, size = 20) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON_TRANSLATE = svg('<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>');
const ICON_SUMMARY = svg('<path d="M9.94 14.06 4 20M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>', 15);

/** 进度环：半径 22 的圆周长 */
const RING = 2 * Math.PI * 22;

/**
 * 配色：按钮实心时用主题的浅色版主色 + 白字（深色模式下也一样，避免浅粉底配黑字）；
 * 未开启时是白底 / 深灰底 + 主题色图标。浮出的工具条用中性色，选中项是凸起的白块，不用大面积主题色。
 */
const CSS = `
:host { all: initial; --p: var(--tx-primary, #4f46e5); --pf: var(--tx-primary-fg, #fff); --icon: var(--tx-primary, #4f46e5);
  --surface: #ffffff; --fg: #1d1d2b; --muted-fg: #6b6b80; --track: #f1f1f5; --raised: #ffffff; --border: rgba(15,15,30,.08);
  --shadow: 0 6px 20px rgba(15,15,30,.14), 0 1px 3px rgba(15,15,30,.08); }
.wrap { position: fixed; right: 18px; bottom: 96px; z-index: 2147483646; display: flex; flex-direction: column;
  align-items: flex-end; gap: 8px; font: 13px/1.2 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased; }
.wrap.left { align-items: flex-start; }
.wrap.dragging { transition: none; user-select: none; }
.dock { position: relative; width: 40px; height: 40px; }
.btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer; padding: 0;
  color: var(--icon); background: var(--surface); box-shadow: var(--shadow); display: grid; place-items: center;
  transition: transform .15s, background .15s, color .15s; touch-action: none; }
.btn:hover { transform: scale(1.06); }
.wrap.dragging .btn { cursor: grabbing; transform: scale(1.08); }
.btn.on { background: var(--p); color: var(--pf); border-color: transparent; }
.btn svg { display: block; pointer-events: none; }
.ring { position: absolute; inset: -4px; width: 48px; height: 48px; pointer-events: none; transform: rotate(-90deg); opacity: 0; transition: opacity .2s; }
.ring.show { opacity: 1; }
.ring circle { fill: none; stroke-width: 2.5; }
.ring .bg { stroke: color-mix(in srgb, var(--p) 18%, transparent); }
.ring .fg { stroke: var(--p); stroke-linecap: round; transition: stroke-dashoffset .3s; }
.badge { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
  border-radius: 8px; border: none; background: #dc2626; color: #fff; font: 600 10px/16px system-ui, sans-serif; cursor: pointer; display: none; }
.badge.show { display: block; }
.close { position: absolute; top: -5px; left: -5px; width: 16px; height: 16px; border-radius: 50%; border: none; padding: 0;
  background: var(--fg); color: var(--surface); font-size: 11px; line-height: 16px; cursor: pointer; display: none; opacity: .75; }
.wrap.left .close { left: auto; right: -5px; }
.wrap:hover:not(.dragging) .close { display: block; }
.bar { display: none; flex-direction: column; gap: 6px; padding: 6px; border-radius: 14px; background: var(--surface);
  border: 1px solid var(--border); box-shadow: var(--shadow); color: var(--fg); }
.wrap:hover:not(.dragging) .bar { display: flex; }
.seg { display: none; gap: 2px; padding: 2px; border-radius: 10px; background: var(--track); }
.seg.show { display: flex; }
.seg button { flex: 1; border: none; background: transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  font: inherit; color: var(--muted-fg); white-space: nowrap; transition: background .15s, color .15s; }
.seg button:hover { color: var(--fg); }
.seg button.active { background: var(--raised); color: var(--fg); font-weight: 600; box-shadow: 0 1px 3px rgba(15,15,30,.12); }
.act { display: flex; align-items: center; justify-content: center; gap: 6px; border: none; background: transparent; color: var(--fg);
  padding: 7px 10px; border-radius: 8px; cursor: pointer; font: inherit; white-space: nowrap; }
.act:hover { background: var(--track); }
.act svg { color: var(--icon); }
.status { font-size: 11px; color: var(--muted-fg); text-align: center; padding: 0 4px 2px; max-width: 220px; line-height: 1.5; }
.status:empty { display: none; }
${darkRules('', `--icon: var(--tx-link-d, #a5b4fc); --surface: #24252f; --fg: #ececf3; --muted-fg: #a0a1b5; --track: #2f303c;
  --raised: #44465a; --border: rgba(255,255,255,.08); --shadow: 0 6px 20px rgba(0,0,0,.4);`)}
/* 触屏没有悬停：开启翻译时一直显示工具条，按钮更大方便点 */
@media (hover: none) {
  .wrap { right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); }
  .bar.touch { display: flex; }
  .seg button { padding: 8px 11px; }
  .close { display: block; }
}
`;

export interface FloatingButtonHandlers {
  onToggle(): void;
  onMode(mode: DisplayMode): void;
  onRetryFailed(): void;
  onSummarize(): void;
}

interface DockPosition {
  side: 'left' | 'right';
  /** 距离视口底部的像素 */
  bottom: number;
}

const POS_KEY = 'floatPosition';

/**
 * 页面角落的悬浮按钮，放在 Shadow DOM 里，不受原网站 CSS 影响。
 * 可以拖动，松手后吸附到左右边缘，位置记在本地（所有网站共用）。
 * 鼠标移上去浮出工具条：显示方式切换、AI 总结全文。
 */
export class FloatingButton {
  private host: HTMLElement;
  private wrap: HTMLDivElement;
  private btn: HTMLButtonElement;
  private bar: HTMLDivElement;
  private seg: HTMLDivElement;
  private status: HTMLDivElement;
  private ringFg: SVGCircleElement;
  private ring: SVGSVGElement;
  private badge: HTMLButtonElement;
  private modeButtons = new Map<DisplayMode, HTMLButtonElement>();
  private pos: DockPosition = { side: 'right', bottom: 96 };

  constructor(private handlers: FloatingButtonHandlers) {
    this.host = document.createElement('tx-float');
    registerThemedHost(this.host);
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    this.wrap = document.createElement('div');
    this.wrap.className = 'wrap';

    // 工具条：显示方式 + 总结
    this.bar = document.createElement('div');
    this.bar.className = 'bar';
    this.seg = document.createElement('div');
    this.seg.className = 'seg';
    for (const { mode, label } of MODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => handlers.onMode(mode));
      this.seg.appendChild(b);
      this.modeButtons.set(mode, b);
    }
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'act';
    summary.innerHTML = `${ICON_SUMMARY}<span>AI 总结全文</span>`;
    summary.addEventListener('click', () => handlers.onSummarize());
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.bar.append(this.seg, summary, this.status);

    // 圆形按钮 + 进度环 + 失败数角标 + 隐藏按钮
    const dock = document.createElement('div');
    dock.className = 'dock';
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'btn';
    this.btn.innerHTML = ICON_TRANSLATE;
    this.btn.title = '翻译当前页面 (Alt+A)，可拖动';
    this.btn.setAttribute('aria-label', '翻译当前页面');

    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.setAttribute('class', 'ring');
    this.ring.setAttribute('viewBox', '0 0 48 48');
    const bg = document.createElementNS(ns, 'circle');
    this.ringFg = document.createElementNS(ns, 'circle');
    for (const [c, cls] of [
      [bg, 'bg'],
      [this.ringFg, 'fg'],
    ] as const) {
      c.setAttribute('class', cls);
      c.setAttribute('cx', '24');
      c.setAttribute('cy', '24');
      c.setAttribute('r', '22');
    }
    this.ringFg.setAttribute('stroke-dasharray', String(RING));
    this.ring.append(bg, this.ringFg);

    this.badge = document.createElement('button');
    this.badge.type = 'button';
    this.badge.className = 'badge';
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onRetryFailed();
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.title = '在此页面隐藏悬浮按钮';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.unmount();
    });

    dock.append(this.ring, this.btn, this.badge, close);
    this.wrap.append(this.bar, dock);
    shadow.appendChild(this.wrap);

    this.enableDrag();
    void browser.storage.local
      .get(POS_KEY)
      .then((r) => {
        const p = r[POS_KEY] as DockPosition | undefined;
        if (p && (p.side === 'left' || p.side === 'right') && Number.isFinite(p.bottom)) this.applyPosition(p);
      })
      .catch(() => {});
  }

  mount() {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  unmount() {
    this.host.remove();
  }

  private applyPosition(p: DockPosition) {
    const max = Math.max(16, window.innerHeight - 60);
    this.pos = { side: p.side, bottom: Math.min(Math.max(16, p.bottom), max) };
    const s = this.wrap.style;
    s.bottom = `${this.pos.bottom}px`;
    s.left = this.pos.side === 'left' ? '18px' : 'auto';
    s.right = this.pos.side === 'right' ? '18px' : 'auto';
    this.wrap.classList.toggle('left', this.pos.side === 'left');
  }

  /** 按住按钮拖动；移动超过 5px 才算拖动，否则当作点击 */
  private enableDrag() {
    let start: { x: number; y: number; left: number; top: number } | null = null;
    let dragged = false;

    this.btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = this.btn.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      dragged = false;
      // 立即捕获指针：快速拖动时指针会先离开按钮，之后的移动事件仍然发给按钮
      try {
        this.btn.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件等情况下不支持 */
      }
    });
    this.btn.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      if (!dragged) {
        dragged = true;
        this.wrap.classList.add('dragging');
      }
      // 拖动中直接跟手：用 left/top 定位按钮所在的整个容器
      const s = this.wrap.style;
      const x = Math.min(Math.max(4, start.left + dx), window.innerWidth - 44);
      const y = Math.min(Math.max(4, start.top + dy), window.innerHeight - 44);
      s.right = 'auto';
      s.left = `${x}px`;
      s.bottom = `${window.innerHeight - y - 40}px`;
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      start = null;
      try {
        this.btn.releasePointerCapture(e.pointerId);
      } catch {
        /* 已释放 */
      }
      if (!dragged) return;
      this.wrap.classList.remove('dragging');
      const r = this.btn.getBoundingClientRect();
      const side = r.left + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
      this.applyPosition({ side, bottom: window.innerHeight - r.bottom });
      void browser.storage.local.set({ [POS_KEY]: this.pos }).catch(() => {});
    };
    this.btn.addEventListener('pointerup', end);
    this.btn.addEventListener('pointercancel', end);
    this.btn.addEventListener('click', (e) => {
      // 拖动结束时浏览器还会补发一次 click，忽略
      if (dragged) {
        dragged = false;
        e.preventDefault();
        return;
      }
      this.handlers.onToggle();
    });
  }

  update(s: PageStatus) {
    this.btn.classList.toggle('on', s.enabled);
    const busy = s.enabled && s.done + s.failed < s.total;
    const label = s.enabled ? '还原为原文 (Alt+A)' : '翻译当前页面 (Alt+A)';
    this.btn.title = `${label}，可拖动`;
    this.btn.setAttribute('aria-label', label);
    this.seg.classList.toggle('show', s.enabled);
    this.bar.classList.toggle('touch', s.enabled);
    for (const [mode, b] of this.modeButtons) b.classList.toggle('active', mode === s.mode);

    // 进度环：翻译进行中显示，全部完成后淡出
    const ratio = s.total ? (s.done + s.failed) / s.total : 0;
    this.ring.classList.toggle('show', busy);
    this.ringFg.setAttribute('stroke-dashoffset', String(RING * (1 - ratio)));

    this.badge.classList.toggle('show', s.enabled && s.failed > 0);
    this.badge.textContent = String(s.failed);
    this.badge.title = `${s.failed} 段翻译失败${s.error ? `：${s.error}` : ''}，点击重试`;

    this.status.textContent = !s.enabled
      ? ''
      : s.failed
        ? `${s.failed} 段失败，点红色角标重试`
        : busy
          ? `已翻译 ${s.done} / ${s.total} 段`
          : '';
  }
}
