// 评论区端到端测试：closed Shadow DOM 里的评论（Coral / OpenWeb 一类组件）、跨域 iframe 里的评论（Disqus 一类），
// 以及译文字号、显示模式在 shadow root 里也生效、关闭翻译时一起清理
// 用法：npm run build && node e2e/comments.mjs
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

let port = 0;
const PAGES = {
  '/article': () => `<!doctype html><html lang="en"><head><title>Comments</title></head>
  <body style="font:18px/1.6 Georgia, serif;max-width:760px;margin:40px auto">
    <p id="p1">Wealthier Americans have a rosier outlook, according to the latest survey of consumers.</p>
    <div id="coral_thread"></div>
    <div id="frame-slot"></div>
    <script>
      // 模拟评论组件：先插入容器，稍后 attachShadow（closed），再陆续加载回复
      setTimeout(() => {
        const host = document.createElement('div');
        host.className = 'coral';
        document.getElementById('coral_thread').append(host);
        setTimeout(() => {
          const root = host.attachShadow({ mode: 'closed' });
          window.__closedRoot = root;
          root.innerHTML = '<div class="stream" style="font-size:16px"><p id="c1">I am always bemused by people who never cook at home.</p></div>';
          setTimeout(() => {
            const reply = document.createElement('p');
            reply.id = 'c2';
            reply.textContent = 'So many problems are caused by overspending on small things.';
            root.querySelector('.stream').append(reply);
          }, 600);
        }, 300);
      }, 200);
      setTimeout(() => {
        const f = document.createElement('iframe');
        f.src = 'http://localhost:${port}/frame';
        f.style.cssText = 'width:700px;height:200px;border:1px solid #ccc';
        document.getElementById('frame-slot').append(f);
      }, 700);
    </script>
  </body></html>`,
  '/frame': () => `<!doctype html><html lang="en"><body style="font:16px sans-serif">
    <p id="d1">This comment lives inside a cross-origin iframe, like Disqus.</p>
  </body></html>`,
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    const page = PAGES[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page ? page() : '');
  }
  let body = '';
  for await (const c of req) body += c;
  const json = JSON.parse(body);
  const last = json.messages.at(-1).content;
  const text = [...last.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)].map((m) => `<seg id="${m[1]}">【译】${m[2]}</seg>`).join('\n') || `【译】${last}`;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const ctx = await playwright.chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
};
const shots = process.env.E2E_SHOTS;

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  await new Promise((r) => setTimeout(r, 1500));
  const id = sw.url().split('/')[2];
  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  const setSettings = (patch) =>
    options.evaluate(async (patch) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, ...patch } });
    }, patch);
  await options.evaluate(
    (baseURL) => chrome.storage.local.set({ settings: { activeProvider: 'custom', providers: { custom: { apiKey: 'k', baseURL, model: 'mock' } }, alwaysTranslateSites: ['127.0.0.1'] } }),
    `${base}/v1`,
  );

  const page = await ctx.newPage();
  await page.goto(`${base}/article`);

  // ---------- 正文 + 译文字号 ----------
  await page.waitForFunction(() => document.querySelector('#p1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  const size = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#p1 tx-translation')).fontSize));
  check('译文字号默认比原文小一号（18px × 0.88）', Math.abs(size - 18 * 0.88) < 0.1, `${size}px`);

  // ---------- closed Shadow DOM 里的评论 ----------
  const shadowState = (sel) =>
    page.evaluate((sel) => {
      const el = window.__closedRoot?.querySelector(`${sel} tx-translation`);
      return el ? { state: el.dataset.txState, text: el.textContent, display: getComputedStyle(el).display, size: parseFloat(getComputedStyle(el).fontSize) } : null;
    }, sel);
  await page.waitForFunction(() => window.__closedRoot?.querySelector('#c1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  const c1 = await shadowState('#c1');
  check('closed Shadow DOM 里的评论被翻译', c1.text.startsWith('【译】I am always bemused'), c1.text);
  check('译文样式注入到 shadow root（块级显示、字号缩放）', c1.display === 'block' && Math.abs(c1.size - 16 * 0.88) < 0.1, JSON.stringify(c1));
  await page.waitForFunction(() => window.__closedRoot?.querySelector('#c2 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  check('评论区后加载的回复也被翻译（监听 shadow root 内的变化）', (await shadowState('#c2')).text.includes('overspending'));

  // ---------- 跨域 iframe 里的评论 ----------
  const frame = await (async () => {
    for (let i = 0; i < 50; i++) {
      const f = page.frames().find((f) => f.url().includes('/frame'));
      if (f) return f;
      await page.waitForTimeout(100);
    }
  })();
  await frame.waitForFunction(() => document.querySelector('#d1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  check('跨域 iframe 里的评论跟随顶层页面翻译', (await frame.locator('#d1 tx-translation').textContent()).includes('cross-origin iframe'));
  check('iframe 里不显示悬浮按钮', (await frame.locator('tx-float').count()) === 0 && (await page.locator('tx-float').count()) === 1);
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/comments.png` });

  // ---------- 显示模式在 shadow root 里也生效 ----------
  await setSettings({ displayMode: 'original' });
  await page.waitForFunction(() => getComputedStyle(window.__closedRoot.querySelector('#c1 tx-translation')).display === 'none', null, { timeout: 5000 }).then(
    () => check('「只看原文」在 shadow root 里也隐藏译文', true),
    () => check('「只看原文」在 shadow root 里也隐藏译文', false),
  );
  await setSettings({ displayMode: 'bilingual', translationSize: 1 });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('#p1 tx-translation')).fontSize) === 18, null, { timeout: 5000 }).then(
    () => check('改成「同原文」后译文字号立即变化', true),
    () => check('改成「同原文」后译文字号立即变化', false),
  );

  // ---------- 关闭翻译：shadow root 和 iframe 一起还原 ----------
  await page.mouse.click(page.viewportSize().width - 38, page.viewportSize().height - 116);
  await page.waitForFunction(() => !document.querySelector('#p1 tx-translation'), null, { timeout: 5000 });
  await page.waitForFunction(() => !window.__closedRoot.querySelector('tx-translation'), null, { timeout: 5000 }).then(
    () => check('关闭翻译时清理 shadow root 里的译文', true),
    () => check('关闭翻译时清理 shadow root 里的译文', false),
  );
  await frame.waitForFunction(() => !document.querySelector('tx-translation'), null, { timeout: 5000 }).then(
    () => check('关闭翻译时 iframe 跟着还原', true),
    () => check('关闭翻译时 iframe 跟着还原', false),
  );
  await page.mouse.click(page.viewportSize().width - 38, page.viewportSize().height - 116);
  await frame.waitForFunction(() => document.querySelector('#d1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 }).then(
    () => check('再次开启时 iframe 跟着翻译', true),
    () => check('再次开启时 iframe 跟着翻译', false),
  );
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await ctx.close();
  server.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
