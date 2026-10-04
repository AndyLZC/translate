import type { PageStatus } from '@/lib/messaging';
import type { DisplayMode } from '@/lib/settings';

const MODES: { mode: DisplayMode; label: string }[] = [
  { mode: 'bilingual', label: '双语' },
  { mode: 'translation', label: '译文' },
  { mode: 'original', label: '原文' },
];

const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 18px; bottom: 96px; z-index: 2147483646; display: flex; flex-direction: column;
  align-items: flex-end; gap: 6px; font: 13px/1.2 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.btn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; color: #fff; background: #4f46e5;
  box-shadow: 0 4px 14px rgba(0,0,0,.22); font-size: 16px; font-weight: 600; display: grid; place-items: center;
  transition: transform .15s, background .15s; position: relative; }
.btn:hover { transform: scale(1.06); }
.btn.on { background: #059669; }
.btn.busy::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid transparent;
  border-top-color: #4f46e5; animation: spin .9s linear infinite; }
.btn.err { background: #dc2626; }
.menu { display: none; background: #fff; color: #111; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.18);
  padding: 4px; gap: 2px; }
.wrap:hover .menu.show { display: flex; }
.menu button { border: none; background: transparent; padding: 6px 9px; border-radius: 7px; cursor: pointer; font: inherit; color: inherit; }
.menu button:hover { background: #eef2ff; }
.menu button.active { background: #4f46e5; color: #fff; }
.progress { font-size: 11px; color: #555; background: #fff; border-radius: 8px; padding: 2px 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,.12); display: none; }
.progress.show { display: block; }
.close { position: absolute; top: -6px; left: -6px; width: 16px; height: 16px; border-radius: 50%; border: none;
  background: #6b7280; color: #fff; font-size: 11px; line-height: 16px; padding: 0; cursor: pointer; display: none; }
.wrap:hover .close { display: block; }
@media (prefers-color-scheme: dark) {
  .menu, .progress { background: #1f2937; color: #e5e7eb; }
  .menu button:hover { background: #374151; }
}
@keyframes spin { to { transform: rotate(360deg); } }
`;

export interface FloatingButtonHandlers {
  onToggle(): void;
  onMode(mode: DisplayMode): void;
  onRetryFailed(): void;
}

/** 页面右下角的悬浮按钮，放在 Shadow DOM 里，不受原网站 CSS 影响 */
export class FloatingButton {
  private host: HTMLElement;
  private btn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private progress: HTMLDivElement;
  private modeButtons = new Map<DisplayMode, HTMLButtonElement>();

  constructor(private handlers: FloatingButtonHandlers) {
    this.host = document.createElement('tx-float');
    const shadow = this.host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style>`;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    this.menu = document.createElement('div');
    this.menu.className = 'menu';
    for (const { mode, label } of MODES) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => handlers.onMode(mode));
      this.menu.appendChild(b);
      this.modeButtons.set(mode, b);
    }

    this.progress = document.createElement('div');
    this.progress.className = 'progress';
    this.progress.addEventListener('click', () => handlers.onRetryFailed());

    this.btn = document.createElement('button');
    this.btn.className = 'btn';
    this.btn.textContent = '译';
    this.btn.title = '翻译 / 还原当前页面 (Alt+A)';
    this.btn.addEventListener('click', () => handlers.onToggle());

    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = '在此页面隐藏悬浮按钮';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.unmount();
    });

    const btnWrap = document.createElement('div');
    btnWrap.style.position = 'relative';
    btnWrap.append(this.btn, close);
    wrap.append(this.menu, this.progress, btnWrap);
    shadow.appendChild(wrap);
  }

  mount() {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  unmount() {
    this.host.remove();
  }

  update(s: PageStatus) {
    this.btn.classList.toggle('on', s.enabled);
    const busy = s.enabled && s.done + s.failed < s.total;
    this.btn.classList.toggle('busy', busy);
    this.btn.classList.toggle('err', s.enabled && !busy && s.failed > 0);
    this.btn.textContent = s.enabled ? '原' : '译';
    this.btn.title = s.enabled ? '还原为原文 (Alt+A)' : '翻译当前页面 (Alt+A)';
    this.menu.classList.toggle('show', s.enabled);
    for (const [mode, b] of this.modeButtons) b.classList.toggle('active', mode === s.mode);

    const showProgress = s.enabled && (busy || s.failed > 0);
    this.progress.classList.toggle('show', showProgress);
    this.progress.textContent = s.failed
      ? `${s.done}/${s.total} · ${s.failed} 段失败，点此重试`
      : `${s.done}/${s.total}`;
    this.progress.style.cursor = s.failed ? 'pointer' : 'default';
  }
}
