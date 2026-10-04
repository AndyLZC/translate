// YouTube 字幕端到端测试：用 Playwright 在 www.youtube.com 地址上提供一个模拟播放器页面
// （元素 id/class、字幕请求格式与真实 YouTube 一致），配合本地模拟的 OpenAI 兼容接口。
// 用法：npm run build && node e2e/youtube.mjs
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const EXT = path.resolve('.output/chrome-mv3');
const prompts = [];

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = JSON.parse(body);
  const user = json.messages.find((m) => m.role === 'user').content;
  prompts.push(user);
  const segs = [...user.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)];
  const content = segs.map((m) => `<seg id="${m[1]}">【译】${m[2]}</seg>`).join('\n') || '你好';
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const MANUAL = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello everyone, and welcome' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'to the channel.' }] },
    { tStartMs: 4200, dDurationMs: 2500, segs: [{ utf8: 'Today we talk\nabout cats.' }] },
  ],
};
const ASR = {
  events: [
    { tStartMs: 0, dDurationMs: 9000, wWinId: 1 },
    { tStartMs: 500, dDurationMs: 3000, segs: [{ utf8: 'so' }, { utf8: ' today', tOffsetMs: 300 }, { utf8: ' we', tOffsetMs: 600 }, { utf8: ' build', tOffsetMs: 900 }] },
    { tStartMs: 1700, dDurationMs: 1000, segs: [{ utf8: 'a' }, { utf8: ' robot', tOffsetMs: 200 }] },
  ],
};

/** 20 秒静音 WAV：给 <video> 一个真实可跳转的媒体，播放进度由测试设置 currentTime 控制 */
function silentWav(seconds = 20, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  buf.fill(128, 44);
  return buf;
}
const WAV = silentWav();

const PAGE = `<!doctype html><html><head><title>Mock Video - YouTube</title></head><body style="margin:0;background:#111">
<div id="movie_player" class="html5-video-player ytp-autohide" style="position:relative;width:854px;height:480px;background:#000;overflow:hidden">
  <video class="html5-main-video" src="/media/silence.wav" preload="auto" style="width:100%;height:100%"></video>
  <div class="ytp-caption-window-container"><span id="native" style="color:#fff">NATIVE CAPTION</span></div>
  <div class="ytp-chrome-bottom" style="position:absolute;bottom:0;right:0"><div class="ytp-right-controls" style="display:flex"><button class="ytp-subtitles-button ytp-button" style="width:48px;height:48px">CC</button></div></div>
</div>
<script>
  const v = document.querySelector('video');
  window.seek = (sec) => new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = sec; });
  const p = document.getElementById('movie_player');
  let track = null;
  const vid = () => new URL(location.href).searchParams.get('v');
  const asr = () => vid() === 'vid2';
  p.getPlayerResponse = () => ({ videoDetails: { videoId: vid() }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', kind: asr() ? 'asr' : undefined, name: { simpleText: 'English' } }] } } });
  p.getOption = () => track || {};
  p.loadModule = () => {};
  p.setOption = (m, o, val) => { track = val; load(); };
  p.toggleSubtitlesOn = () => { track = { languageCode: 'en' }; load(); };
  function load() {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/timedtext?v=' + vid() + '&lang=en' + (asr() ? '&kind=asr' : '') + '&fmt=json3&pot=token');
    x.send();
  }
  window.__navigate = (id) => { history.pushState({}, '', '/watch?v=' + id); track = null; document.dispatchEvent(new Event('yt-navigate-finish')); };
</script></body></html>`;

const ctx = await playwright.chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://www.youtube.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/timedtext') {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.searchParams.get('kind') === 'asr' ? ASR : MANUAL) });
  }
  if (url.pathname === '/media/silence.wav') {
    // 支持 Range 请求，浏览器才允许跳转播放进度
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : WAV.length - 1;
    return route.fulfill({
      status: m ? 206 : 200,
      headers: {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        ...(m ? { 'content-range': `bytes ${start}-${end}/${WAV.length}` } : {}),
      },
      body: WAV.subarray(start, end + 1),
    });
  }
  if (url.pathname === '/watch') return route.fulfill({ contentType: 'text/html', body: PAGE });
  return route.fulfill({ status: 404, body: '' });
});

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
};

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.evaluate(
    (baseURL) => chrome.storage.local.set({ settings: { activeProvider: 'custom', providers: { custom: { apiKey: 'k', baseURL, model: 'm' } } } }),
    `${base}/v1`,
  );

  const page = await ctx.newPage();
  await page.goto('https://www.youtube.com/watch?v=vid1');
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  const sub = page.locator('tx-subtitle');
  const orig = page.locator('tx-subtitle .orig');
  const tr = page.locator('tx-subtitle .tr');

  await page.waitForSelector('.ytp-right-controls .tx-yt-btn', { timeout: 10000 });
  check('播放器控制栏出现「译」按钮且默认开启', (await page.getAttribute('.tx-yt-btn', 'aria-pressed')) === 'true');

  await page.evaluate(() => window.seek(1));
  await tr.filter({ hasText: '【译】' }).waitFor({ timeout: 15000 });
  check('自动打开字幕并显示双语：原文合并成整句', (await orig.textContent()) === 'Hello everyone, and welcome to the channel.', await orig.textContent());
  check('译文显示', (await tr.textContent()) === '【译】Hello everyone, and welcome to the channel.', await tr.textContent());
  check('原生字幕被隐藏', (await page.evaluate(() => getComputedStyle(document.querySelector('.ytp-caption-window-container')).display)) === 'none');
  const subtitlePrompt = prompts.find((p) => p.includes('subtitle lines'));
  check('一个请求翻译整条字幕，并带字幕上下文提示', prompts.length === 1 && !!subtitlePrompt && subtitlePrompt.includes('"Mock Video"'), `请求数 ${prompts.length}`);

  await page.evaluate(() => window.seek(5));
  await orig.filter({ hasText: 'Today we talk about cats.' }).waitFor({ timeout: 5000 });
  check('随播放进度切换到下一句', (await tr.textContent()) === '【译】Today we talk about cats.');

  await page.evaluate(() => window.seek(9));
  await page.waitForTimeout(200);
  check('句子之间的长空档不显示字幕', !(await page.locator('tx-subtitle .box').isVisible()));

  // 只看译文
  await page.evaluate(() => window.seek(1));
  await options.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, displayMode: 'translation' } });
  });
  await page.waitForTimeout(400);
  check('只看译文：隐藏原文行', !(await orig.isVisible()) && (await tr.isVisible()));
  await options.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, displayMode: 'bilingual' } });
  });

  // 关闭：恢复原生字幕
  await page.click('.tx-yt-btn');
  await page.waitForTimeout(300);
  const nativeShown = await page.evaluate(() => getComputedStyle(document.querySelector('.ytp-caption-window-container')).display !== 'none');
  const saved = await options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.youtubeEnabled);
  check('点「译」关闭：叠加字幕消失、原生字幕恢复、设置已保存', !(await page.locator('tx-subtitle .box').isVisible()) && nativeShown && saved === false);
  await page.click('.tx-yt-btn');
  await tr.filter({ hasText: '【译】' }).waitFor({ timeout: 5000 });
  check('再次开启：直接用已翻译的结果，不重复请求', prompts.length === 1, `请求数 ${prompts.length}`);

  // 单页应用切换到另一个视频（自动字幕，逐词）
  await page.evaluate(() => window.seek(1));
  await page.evaluate(() => window.__navigate('vid2'));
  await orig.filter({ hasText: 'so today we build a robot' }).waitFor({ timeout: 15000 });
  await tr.filter({ hasText: '【译】so today we build a robot' }).waitFor({ timeout: 15000 });
  check('切换视频后加载新字幕：自动字幕按停顿合并成句并翻译', true);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: process.env.E2E_SCREENSHOT ?? 'e2e/youtube.png' });
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await ctx.close();
  server.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
