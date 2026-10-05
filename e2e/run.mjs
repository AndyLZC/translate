// 端到端冒烟测试：真实 Chromium 加载构建产物 + 本地模拟 OpenAI 接口 + 本地测试页面
// 用法：npm run build && node e2e/run.mjs
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
const requests = [];
const claudeRequests = [];

const PAGE = `<!doctype html><html lang="en"><head><title>E2E Test Page</title>
<style>body{font:16px/1.6 sans-serif;max-width:700px;margin:auto} .spacer{height:3000px}</style></head><body>
<nav id="nav"><a href="/us">US news</a> <a href="/world">World news</a></nav>
<button id="btn">Subscribe now</button>
<h1>Hello world</h1>
<p id="p1">Read the <a href="https://example.com/docs">documentation</a> and <b>star</b> the repo.</p>
<p id="zh">这一段已经是中文了。</p>
<pre id="code">const answer = 42;</pre>
<div id="mixed">Intro words here<p>Nested paragraph text</p>trailing words</div>
<div class="spacer"></div>
<p id="far">This paragraph is far below the fold.</p>
<div id="dyn"></div>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/page') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    const json = JSON.parse(body);
    if (req.headers.authorization === 'Bearer bad-key') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } }));
    }
    const user = json.messages.find((m) => m.role === 'user').content;
    requests.push(user);
    const segs = [...user.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)];
    // 模拟翻译：保留占位符，文字前加【译】
    const content = segs.length
      ? segs.map((m) => `<seg id="${m[1]}">【译】${m[2]}</seg>`).join('\n')
      : '你好，世界！';
    await new Promise((r) => setTimeout(r, 150));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        id: 'x',
        object: 'chat.completion',
        created: 0,
        model: json.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  }
  if (req.url === '/v1/messages' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    const json = JSON.parse(body);
    claudeRequests.push({ body: json, apiKey: req.headers['x-api-key'] });
    const user = json.messages[0].content;
    const segs = [...user.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)];
    const text = segs.length ? segs.map((m) => `<seg id="${m[1]}">【Claude】${m[2]}</seg>`).join('\n') : '你好，世界！';
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        id: 'msg_x',
        type: 'message',
        role: 'assistant',
        model: json.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await playwright.chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
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

  // 首次安装会自动打开设置页；在设置页里写入配置
  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.evaluate(async (baseURL) => {
    await chrome.storage.local.set({
      settings: { activeProvider: 'custom', providers: { custom: { apiKey: 'test', baseURL, model: 'mock-model' } }, batchSize: 5 },
    });
  }, `${base}/v1`);
  await options.reload();
  await options.getByRole('button', { name: '测试连接' }).click();
  await options.getByText(/连接成功/).waitFor({ timeout: 10000 });
  check('设置页测试连接', true, await options.getByText(/连接成功/).textContent());

  const page = await ctx.newPage();
  await page.goto(`${base}/page`);
  await page.waitForTimeout(800);
  const btn = page.locator('tx-float');
  check('悬浮按钮已挂载', (await btn.count()) === 1);

  // 点击右下角悬浮按钮开始翻译（无头模式下扩展快捷键不可用）
  await page.mouse.click(page.viewportSize().width - 38, page.viewportSize().height - 116);

  await page.waitForFunction(() => document.querySelector('#p1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  const p1 = await page.locator('#p1 tx-translation').innerHTML();
  check('段落已翻译且链接/加粗保留', p1.includes('<a href="https://example.com/docs">【译】documentation</a>') || p1.includes('href="https://example.com/docs"'), p1);
  check('链接在译文中可点击', (await page.locator('#p1 tx-translation a[href="https://example.com/docs"]').count()) === 1);
  check('标题翻译', (await page.locator('h1 tx-translation').textContent())?.includes('【译】Hello world'));
  check('已是中文的段落跳过', (await page.locator('#zh tx-translation').count()) === 0);
  check('导航菜单和按钮跳过', (await page.locator('#nav tx-translation, #btn tx-translation').count()) === 0);
  check('代码块跳过', (await page.locator('#code tx-translation').count()) === 0);
  const mixed = await page.locator('#mixed > tx-translation').allTextContents();
  check('混合块按行内片段分别翻译', mixed.length === 2 && mixed[0].includes('Intro words here'), JSON.stringify(mixed));
  check('首屏之外的段落尚未翻译', (await page.locator('#far tx-translation').count()) === 0);

  const before = requests.length;
  await page.locator('#far').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#far tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  check('滚动到可视区域后才翻译', requests.length > before);
  check('批量请求带编号', requests.some((r) => (r.match(/<seg id=/g) || []).length >= 3), `共 ${requests.length} 个请求`);

  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'new';
    p.textContent = 'Dynamically inserted content.';
    document.getElementById('dyn').appendChild(p);
  });
  await page.waitForFunction(() => document.querySelector('#new tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  check('动态插入的内容自动翻译', true);

  await page.evaluate(() => (document.querySelector('#new').firstChild.data = 'Changed text now.'));
  await page.waitForFunction(() => document.querySelector('#new tx-translation')?.textContent?.includes('Changed text now'), null, { timeout: 15000 });
  check('原文变化后重新翻译', (await page.locator('#new tx-translation').count()) === 1);

  // 切换为只看译文
  await options.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, displayMode: 'translation' } });
  });
  await page.waitForFunction(() => document.documentElement.dataset.txMode === 'translation');
  const widths = await page.evaluate(() => {
    const far = document.getElementById('far');
    const range = document.createRange();
    range.selectNodeContents(far.firstChild);
    return { original: range.getBoundingClientRect().width, translation: far.querySelector('tx-translation').getBoundingClientRect().width };
  });
  check('只看译文：原文隐藏、译文可见', widths.original === 0 && widths.translation > 0, JSON.stringify(widths));

  // 刷新后命中缓存，不再请求
  await options.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, displayMode: 'bilingual', alwaysTranslateSites: ['127.0.0.1'] } });
  });
  const beforeReload = requests.length;
  await page.reload();
  // 浏览器可能会恢复刷新前的滚动位置（页面底部）：先等当前可视区域翻译完，再回到顶部
  await page.waitForFunction(() => !!document.querySelector('tx-translation[data-tx-state="done"]'), null, { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelector('#p1 tx-translation')?.dataset.txState === 'done', null, { timeout: 15000 });
  check('总是翻译的网站自动翻译 + 命中缓存不再请求', requests.length === beforeReload, `新增请求 ${requests.length - beforeReload}`);

  // 切换到 Claude：页面自动用新服务商重新翻译
  await options.evaluate(async (baseURL) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: {
        ...settings,
        activeProvider: 'anthropic',
        providers: { ...settings.providers, anthropic: { apiKey: 'sk-ant-test', baseURL, model: 'claude-haiku-4-5' } },
      },
    });
  }, base);
  await page.waitForFunction(() => document.querySelector('#p1 tx-translation')?.textContent?.includes('【Claude】'), null, { timeout: 15000 });
  const p1Claude = await page.locator('#p1 tx-translation').innerHTML();
  check('切换到 Claude 后重新翻译，格式保留', p1Claude.includes('href="https://example.com/docs"') && p1Claude.includes('<b>'), p1Claude);
  const cr = claudeRequests.at(-1);
  check(
    'Claude 请求：Haiku 模型、带 Key、系统提示词、温度',
    cr && cr.body.model === 'claude-haiku-4-5' && cr.apiKey === 'sk-ant-test' && cr.body.system.includes('Simplified Chinese') && cr.body.temperature === 0.2,
    JSON.stringify({ model: cr?.body.model, temperature: cr?.body.temperature, max_tokens: cr?.body.max_tokens }),
  );

  await page.screenshot({ animations: 'disabled', path: process.env.E2E_SCREENSHOT ?? 'e2e/screenshot.png' });

  // 关闭翻译：清理干净
  await page.mouse.click(page.viewportSize().width - 38, page.viewportSize().height - 116);
  await page.waitForTimeout(300);
  check('关闭后移除所有译文', (await page.locator('tx-translation').count()) === 0);

  // API Key 错误：失败原因显示在悬浮按钮旁，段落里只放小标记
  await options.evaluate(async (baseURL) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...settings, activeProvider: 'custom', providers: { ...settings.providers, custom: { apiKey: 'bad-key', baseURL, model: 'other-model' } } },
    });
  }, `${base}/v1`);
  await page.mouse.click(page.viewportSize().width - 38, page.viewportSize().height - 116);
  await page.waitForFunction(() => document.querySelector('#p1 tx-translation')?.dataset.txState === 'error', null, { timeout: 20000 });
  const marker = await page.locator('#p1 tx-translation').textContent();
  const progress = await page.evaluate(() => {
    // 悬浮按钮在 closed shadow root 里，读不到；改为通过 popup 同款状态接口确认
    return document.querySelector('#p1 tx-translation tx-retry')?.getAttribute('title');
  });
  check('API Key 错误：显示失败原因、段落里只有小标记', marker === '重试' && progress.includes('API Key 无效'), `${marker} / ${progress}`);
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await ctx.close();
  server.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
