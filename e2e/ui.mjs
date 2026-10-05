// 悬浮按钮拖动 + AI 总结全文 端到端测试
// 用法：npm run build && node e2e/ui.mjs
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
const calls = [];

const SUMMARY = `【一句话总结】**美国消费靠储蓄和借债撑着，专家担心难以持续。**
【要点】
- **花钱比赚钱快**：支出增速超过可支配收入
- **储蓄见底**：储蓄率降到 4.1%，约为疫情前的一半
- **借债增加**：家庭债务创新高
【关键信息】
- 储蓄率 4.1%（税后收入）
- 消息来源：EY-Parthenon 首席经济学家 Gregory Daco
【作者观点】以中性报道为主，引用专家观点提示消费可能放缓。
【值得学习的表达】
| 表达 | 意思 |
| --- | --- |
| stall /stɔːl/ v. | 停滞 |
| disposable income | 可支配收入 |`;

const paragraphs = [
  'Because spending is growing faster than disposable income, it might stall as people face the limits of what they have in savings or want to borrow, said Gregory Daco, chief economist at EY-Parthenon.',
  "Americans' saving rate has been trending down and is now at the historically low level of 4.1% of after-tax income, versus almost double that before the pandemic.",
  'Meanwhile, Americans are taking on record levels of debt to fund their lives, and economists worry that the spending spree cannot last much longer.',
  'People are using their savings, they are using credit, they are using wealth, and they are trying to find different ways to finance their outlays, Daco said.',
];
const PAGES = {
  '/news': `<!doctype html><html lang="en"><head><title>Americans Keep Spending</title></head><body style="font:18px/1.6 Georgia,serif;max-width:720px;margin:40px auto">
    <nav><a href="/">Home</a> <a href="/world">World</a></nav>
    <article><h1>Americans Keep Spending Despite Low Savings</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</article>
    <footer>Copyright 2026</footer></body></html>`,
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    const page = PAGES[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page ?? '');
  }
  let body = '';
  for await (const c of req) body += c;
  const json = JSON.parse(body);
  const system = json.messages.find((m) => m.role === 'system')?.content ?? '';
  const messages = json.messages.filter((m) => m.role !== 'system');
  calls.push({ system, messages });
  const last = messages.at(-1).content;
  const text = system.includes('summarise web articles')
    ? SUMMARY
    : system.includes('follow-up')
      ? '作者主要引用了储蓄率和债务数据。'
      : [...last.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)].map((m) => `<seg id="${m[1]}">【译】${m[2]}</seg>`).join('\n') || `【译】${last}`;
  if (json.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < text.length; i += 12) {
      res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: { content: text.slice(i, i + 12) }, finish_reason: null }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 15));
    }
    res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
    return res.end('data: [DONE]\n\n');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await playwright.chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 860 },
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
  await options.evaluate((baseURL) => chrome.storage.local.set({ settings: { activeProvider: 'custom', providers: { custom: { apiKey: 'k', baseURL, model: 'mock' } } } }), `${base}/v1`);

  const page = await ctx.newPage();
  await page.bringToFront();
  await page.goto(`${base}/news`);
  await page.waitForTimeout(800);
  const { width: W, height: H } = page.viewportSize();
  const translated = () => page.evaluate(() => !!document.querySelector('tx-translation'));

  // ---------- 拖动悬浮按钮 ----------
  const from = { x: W - 38, y: H - 116 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x - (W - 120) * (i / 10), from.y - 200 * (i / 10));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pos = await options.evaluate(async () => (await chrome.storage.local.get('floatPosition')).floatPosition);
  check('拖到左边松手后吸附到左侧并记住位置', pos?.side === 'left' && Math.abs(pos.bottom - 296) < 6, JSON.stringify(pos));
  check('拖动结束不会误触发翻译', !(await translated()));
  // 吸附后按钮中心：左边 18px + 20px，底部 bottom + 20px
  await page.mouse.click(38, H - pos.bottom - 20);
  await page.waitForFunction(() => document.querySelector('tx-translation')?.dataset.txState === 'done', null, { timeout: 10000 }).then(
    () => check('在新位置点击按钮开始翻译', true),
    () => check('在新位置点击按钮开始翻译', false),
  );
  await page.reload();
  await page.waitForTimeout(800);
  await page.mouse.click(38, H - pos.bottom - 20);
  await page.waitForFunction(() => !!document.querySelector('tx-translation'), null, { timeout: 10000 }).then(
    () => check('刷新后按钮仍在拖动后的位置', true),
    () => check('刷新后按钮仍在拖动后的位置', false),
  );
  await page.mouse.move(38, H - pos.bottom - 20);
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/float-toolbar.png` });

  // ---------- AI 总结 ----------
  const [tab] = await options.evaluate(async (url) => (await chrome.tabs.query({ url })).map((t) => t.id), `${base}/news`);
  await options.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { id: 1, type: 'summarizePage', data: undefined, timestamp: Date.now() }, { frameId: 0 }).catch(() => {}), tab);
  await page.locator('tx-ui .panel .md h4:has-text("值得学习的表达") ~ table td').first().waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('tx-ui').shadowRoot.querySelector('.panel .md .caret'), null, { timeout: 10000 });
  const call = calls.find((c) => c.system.includes('summarise web articles'));
  const input = call?.messages[0].content ?? '';
  check('总结请求带上文章标题和正文', input.includes('Title: Americans Keep Spending') && input.includes('record levels of debt'));
  check('正文提取去掉导航、页脚和插件插入的译文', !input.includes('Copyright 2026') && !input.includes('【译】'), input.slice(0, 80));
  const title = await page.locator('tx-ui .panel-head .title').textContent();
  const sections = await page.locator('tx-ui .panel .md h4').allTextContents();
  check('总结面板：一句话总结、要点、关键信息、作者观点、值得学习的表达', title === 'AI 总结' && sections.join(',') === '一句话总结,要点,关键信息,作者观点,值得学习的表达', sections.join(','));
  const meta = await page.locator('tx-ui .panel .sentence .tr').textContent();
  check('显示文章标题、词数和阅读时间', (await page.locator('tx-ui .panel .sentence .orig').textContent()).includes('Americans Keep Spending') && /约 \d+ 词 · 阅读约 \d+ 分钟/.test(meta), meta);
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/summary.png` });

  await page.locator('tx-ui .panel-foot input').fill('作者的主要依据是什么？');
  await page.locator('tx-ui .panel-foot .btn').click();
  await page.locator('tx-ui .bubble.a:has-text("储蓄率")').waitFor({ timeout: 10000 });
  const fu = calls.at(-1);
  check('可以追问文章内容（带上正文和总结）', fu.messages[0].content.includes('record levels of debt') && fu.messages[1].content.includes('一句话总结'));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await ctx.close();
  server.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
