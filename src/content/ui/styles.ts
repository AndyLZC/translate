/** 浮层样式：与设置页同一套配色（shadcn 风格），跟随系统深浅色 */
export const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer {
  --bg: #ffffff; --fg: #1d1d2b; --muted: #f3f3f7; --muted-fg: #6b6b80; --border: #e7e7ef;
  --primary: #5046e5; --primary-fg: #fff; --accent: #eef0ff; --accent-fg: #3730a3; --danger: #dc2626; --success: #16a34a;
  --shadow: 0 10px 38px -10px rgba(22,23,24,.35), 0 10px 20px -15px rgba(22,23,24,.2);
  font: 14px/1.6 Inter, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: var(--fg); letter-spacing: 0; text-align: left;
}
@media (prefers-color-scheme: dark) {
  .layer { --bg: #1e1f29; --fg: #ececf3; --muted: #2a2b37; --muted-fg: #a0a1b5; --border: rgba(255,255,255,.09);
    --primary: #7c74ff; --primary-fg: #12121a; --accent: #2e2d4d; --accent-fg: #c7c4ff; --shadow: 0 12px 40px -8px rgba(0,0,0,.6); }
}
button { font: inherit; color: inherit; }
.icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px;
  background: transparent; color: var(--muted-fg); cursor: pointer; transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--muted); color: var(--fg); }
.icon-btn.on { color: #e11d48; }
.icon-btn.on svg { fill: currentColor; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border: 0;
  border-radius: 9px; background: var(--primary); color: var(--primary-fg); font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn:disabled { opacity: .55; cursor: default; }
.btn.ghost { background: var(--muted); color: var(--fg); font-weight: 500; }

/* 划词小图标 */
.sel-icon { position: fixed; width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg);
  box-shadow: var(--shadow); display: grid; place-items: center; cursor: pointer; color: var(--primary);
  animation: pop .14s ease-out; pointer-events: auto; padding: 0; }
.sel-icon:hover { background: var(--accent); }

/* 划词卡片 */
.card { position: fixed; width: min(400px, calc(100vw - 24px)); max-height: min(60vh, 460px); display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden;
  animation: pop .16s ease-out; pointer-events: auto; }
.card-head { display: flex; align-items: center; gap: 4px; padding: 8px 8px 6px 14px; border-bottom: 1px solid var(--border); }
.card-head .lang { flex: 1; font-size: 12px; color: var(--muted-fg); display: flex; align-items: center; gap: 6px; }
.card-body { padding: 10px 14px 14px; overflow: auto; }
.card-body .src { color: var(--muted-fg); font-size: 13px; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden; }
.card-body .out { font-size: 15px; white-space: pre-wrap; word-break: break-word; }
.dict .word { font-size: 18px; font-weight: 700; }
.dict .phon { color: var(--muted-fg); font-weight: 400; font-size: 14px; margin-left: 6px; }
.dict .def { margin-top: 4px; }
.dict .ex { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--muted); color: var(--muted-fg); font-size: 13px; }
.error { color: var(--danger); font-size: 13px; }

/* 骨架屏 */
.skeleton { display: grid; gap: 8px; }
.skeleton i { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--muted) 25%, var(--border) 50%, var(--muted) 75%);
  background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.skeleton i:nth-child(2) { width: 85%; } .skeleton i:nth-child(3) { width: 60%; }

/* 解析面板：桌面在右侧，手机为底部弹层 */
.backdrop { position: fixed; inset: 0; background: rgba(10,10,20,.28); animation: fade .15s; pointer-events: auto; }
.panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); overflow: hidden;
  animation: slide-in .2s ease-out; pointer-events: auto; }
@media (max-width: 640px) {
  .panel { top: auto; left: 0; right: 0; bottom: 0; width: 100%; max-height: 82vh; border-radius: 20px 20px 0 0; animation: sheet-up .22s ease-out; }
  .panel::before { content: ''; display: block; width: 40px; height: 4px; border-radius: 2px; background: var(--border); margin: 8px auto 0; }
}
.panel-head { display: flex; align-items: center; gap: 2px; padding: 10px 10px 8px 18px; }
.panel-head .title { flex: 1; font-size: 16px; font-weight: 700; }
.panel-body { flex: 1; overflow: auto; padding: 0 18px 18px; overscroll-behavior: contain; }
.sentence { padding: 14px 16px; border-radius: 14px; background: linear-gradient(135deg, var(--accent), var(--muted)); }
.sentence .orig { font-size: 17px; font-weight: 700; line-height: 1.45; }
.sentence .tr { margin-top: 8px; color: var(--muted-fg); }
.sec-title { display: flex; align-items: center; gap: 8px; margin: 18px 0 8px; font-weight: 700; font-size: 15px; }
.sec-title::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: var(--primary); }
.md h4 { margin: 14px 0 4px; font-size: 14px; color: var(--accent-fg); }
.md p { margin: 2px 0; }
.md ul { margin: 2px 0 2px 2px; padding-left: 16px; }
.md li { margin: 2px 0; }
.md strong { font-weight: 700; }
.chat { display: grid; gap: 10px; margin-top: 14px; }
.bubble { padding: 9px 12px; border-radius: 12px; max-width: 92%; white-space: pre-wrap; word-break: break-word; }
.bubble.q { justify-self: end; background: var(--primary); color: var(--primary-fg); border-bottom-right-radius: 4px; }
.bubble.a { justify-self: start; background: var(--muted); border-bottom-left-radius: 4px; white-space: normal; }
.panel-foot { display: flex; gap: 8px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--bg); }
.panel-foot input { flex: 1; min-width: 0; height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--muted); color: var(--fg); font: inherit; outline: none; }
.panel-foot input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent); }

/* 提示 */
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 9px 16px; border-radius: 10px;
  background: #1d1d2b; color: #fff; font: 13px/1.4 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,.25); animation: pop .16s ease-out; transition: opacity .3s; max-width: 90vw; }
.toast.out { opacity: 0; }

@keyframes pop { from { opacity: 0; transform: scale(.96) translateY(4px); } }
@keyframes fade { from { opacity: 0; } }
@keyframes slide-in { from { opacity: 0; transform: translateX(16px); } }
@keyframes sheet-up { from { transform: translateY(100%); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
