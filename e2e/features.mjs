// 新功能端到端测试：划词翻译 / 查词、学习模式解析与追问、生词本、输入框翻译、悬停翻译、自动翻译外语网页
// 用法：npm run build && node e2e/features.mjs
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

const ANALYSIS = `【译文】这些不受喜爱的生物是土壤的居民。
【句子结构】
**主语**：These unloved critters
**谓语**：are
- along with countless earthworms：介词短语作伴随状语
【重点词汇】
- denizen /ˈden.ɪ.zən/ n. 居民；栖息者
【语法要点】
- what 引导名词性从句`;

function reply(system, messages) {
  const last = messages.at(-1).content;
  if (system.includes('concise bilingual dictionary')) return `${last} /ˈsɔɪl/\nn. 土壤；泥土\n例：Plants grow in soil. 植物生长在土壤里。`;
  if (system.includes('【句子结构】')) return ANALYSIS;
  if (system.includes('follow-up')) return `关于「${last}」：what 在这里引导宾语从句。`;
  if (system.includes('chat box')) return 'Hello, my friend!';
  const segs = [...last.matchAll(/<seg id="(\d+)">([\s\S]*?)<\/seg>/g)];
  if (segs.length) return segs.map((m) => `<seg id="${m[1]}">【译】${m[2]}</seg>`).join('\n');
  return `【译】${last}`;
}

const PAGES = {
  '/article': `<!doctype html><html lang="en"><head><title>Soil</title></head><body style="font:16px/1.6 sans-serif;max-width:720px;margin:40px auto">
    <p id="p1">These unloved critters, along with countless earthworms, are denizens of what is probably the least charismatic habitat of all: soil.</p>
    <p id="p2">And yet the soil and its inhabitants are the most important ecosystems of the lot, argues Frank Ashwood.</p>
    <p id="word">Plants need <span id="w">soil</span> to grow.</p>
    <textarea id="ta" style="width:400px;height:60px"></textarea>
    <div id="ce" contenteditable="true" style="border:1px solid #ccc;min-height:30px"></div>
  </body></html>`,
  '/foreign': `<!doctype html><html><head><title>Foreign</title></head><body><p id="f1">${'This page is written in English and should be translated automatically. '.repeat(4)}</p></body></html>`,
  '/chinese': `<!doctype html><html lang="zh-CN"><head><title>中文</title></head><body><p id="c1">${'这是一段中文内容，不应该被自动翻译。'.repeat(6)}</p></body></html>`,
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
  calls.push({ system, messages, stream: !!json.stream });
  if (json.stream) {
    // OpenAI 流式格式（SSE）：按 8 个字符一块慢慢推，测试能看到逐步显示
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const text = reply(system, messages);
    for (let i = 0; i < text.length; i += 8) {
      res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: { content: text.slice(i, i + 8) }, finish_reason: null }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 40));
    }
    res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
    return res.end('data: [DONE]\n\n');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: reply(system, messages) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
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
  const setSettings = (patch) =>
    options.evaluate(async (patch) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, ...patch } });
    }, patch);
  await options.evaluate((baseURL) => chrome.storage.local.set({ settings: { activeProvider: 'custom', providers: { custom: { apiKey: 'k', baseURL, model: 'mock' } } } }), `${base}/v1`);

  const page = await ctx.newPage();
  await page.bringToFront();
  await page.goto(`${base}/article`);
  await page.waitForTimeout(500);

  // ---------- 划词：句子 ----------
  const p2 = await page.locator('#p2').boundingBox();
  await page.mouse.move(p2.x + 20, p2.y + 5);
  await page.mouse.down();
  await page.mouse.move(p2.x + p2.width - 10, p2.y + p2.height - 5, { steps: 5 });
  await page.mouse.up();
  await page.locator('tx-ui .sel-icon').click({ timeout: 5000 });
  await page.locator('tx-ui .card .out').waitFor({ timeout: 10000 });
  const out = await page.locator('tx-ui .card .out').textContent();
  check('划词翻译：选中后出现图标，点击显示译文', out.startsWith('【译】') && out.includes('soil'), out.slice(0, 40));
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/feat-selection.png` });

  // ---------- 划词：单词 → 词典 ----------
  await page.keyboard.press('Escape');
  await page.locator('#w').dblclick();
  await page.locator('tx-ui .sel-icon').click({ timeout: 5000 });
  await page.locator('tx-ui .dict .word').waitFor({ timeout: 10000 });
  check('选中单词：词典格式（单词 + 音标 + 释义 + 例句）', (await page.locator('tx-ui .dict .word').textContent()).includes('soil') && (await page.locator('tx-ui .dict .phon').textContent()) === '/ˈsɔɪl/' && (await page.locator('tx-ui .dict .ex').count()) === 1);
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/feat-dict.png` });
  await page.locator('tx-ui .card button[title="收藏到生词本"]').click();
  await page.waitForTimeout(300);
  const notes1 = await options.evaluate(async () => (await chrome.storage.local.get('notebook')).notebook ?? []);
  check('单词收藏到生词本', notes1.length === 1 && notes1[0].type === 'word' && notes1[0].text === 'soil');
  await page.keyboard.press('Escape');

  // ---------- 学习模式：整页翻译后点「解析」 ----------
  await page.mouse.click(1280 - 38, 860 - 116);
  await page.locator('#p1 tx-learn').waitFor({ timeout: 10000 });
  const placement = await page.evaluate(() => {
    const learn = document.querySelector('#p1 tx-learn');
    return { next: learn.nextElementSibling?.tagName, prev: learn.previousSibling?.textContent?.trim().slice(-5), inTranslation: !!learn.closest('tx-translation') };
  });
  check('「解析」放在原文句末、译文之前', (await page.locator('#p1 tx-learn').isVisible()) && placement.next === 'TX-TRANSLATION' && placement.prev === 'soil.' && !placement.inTranslation, JSON.stringify(placement));
  await page.locator('#p1 tx-learn').click();
  // 流式：先看到正在生成（带光标）的部分内容，再等全部完成
  await page.locator('tx-ui .panel .md .caret').waitFor({ timeout: 10000 });
  const partial = (await page.locator('tx-ui .panel .md').textContent()).length;
  await page.locator('tx-ui .panel .md h4:has-text("语法要点") ~ ul li').first().waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('tx-ui').shadowRoot.querySelector('.panel .md .caret'), null, { timeout: 10000 });
  const full = (await page.locator('tx-ui .panel .md').textContent()).length;
  const analyzeCall = calls.find((c) => c.system.includes('【句子结构】'));
  check('解析流式输出：先显示部分内容，完成后光标消失', partial > 0 && partial < full && analyzeCall.stream, `${partial} → ${full}`);
  check('页面已有译文时不让模型重复翻译', !analyzeCall.system.includes('【译文】') && analyzeCall.messages[0].content.includes('Reference translation'));
  const orig = await page.locator('tx-ui .panel .sentence .orig').textContent();
  const sections = await page.locator('tx-ui .panel .md h4').allTextContents();
  check('解析面板：原文、句子结构、重点词汇、语法要点', orig.startsWith('These unloved critters') && sections.join(',') === '句子结构,重点词汇,语法要点', sections.join(','));
  check('解析面板：加粗标签渲染、不显示原始 ** 符号', (await page.locator('tx-ui .panel .md strong').first().textContent()) === '主语' && !(await page.locator('tx-ui .panel .md').textContent()).includes('**'));
  const layers = await page.evaluate(() => {
    const md = document.querySelector('tx-ui').shadowRoot.querySelector('.panel .md');
    return { term: md.querySelector('.term')?.textContent, phon: md.querySelector('.phon')?.textContent, pos: md.querySelector('.pos')?.textContent, en: md.querySelector('li .en')?.textContent };
  });
  check('解析分层显示：英文原文、音标、词性分别标出', layers.term === 'along with countless earthworms' && layers.phon === '/ˈden.ɪ.zən/' && layers.pos === 'n.', JSON.stringify(layers));

  await page.locator('tx-ui .panel-foot input').fill('what 在这里是什么用法？');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const a = document.querySelector('tx-ui').shadowRoot.querySelector('.bubble.a');
    return a && a.textContent.includes('引导宾语从句') && !a.querySelector('.caret');
  }, null, { timeout: 10000 });
  const last = calls.at(-1);
  check('追问 AI：带上原文和解析，多轮对话', (await page.locator('tx-ui .bubble.a').textContent()).includes('引导宾语从句') && last.messages.length === 3 && last.messages[1].content.includes('【句子结构】'));
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/feat-analysis.png` });
  await page.locator('tx-ui .panel button[title="收藏到生词本"]').click();
  await page.waitForTimeout(300);
  const notes2 = await options.evaluate(async () => (await chrome.storage.local.get('notebook')).notebook ?? []);
  check('句子收藏到生词本（含解析）', notes2[0]?.type === 'sentence' && notes2[0].analysis.includes('【句子结构】'));
  await page.keyboard.press('Escape');
  check('Esc 关闭解析面板', (await page.locator('tx-ui .panel').count()) === 0);

  // 关闭学习模式后「解析」隐藏
  await setSettings({ learningMode: false });
  await page.waitForTimeout(300);
  check('关闭学习模式后隐藏「解析」', !(await page.locator('#p1 tx-learn').isVisible()));
  await page.mouse.click(1280 - 38, 860 - 116); // 还原
  await page.waitForTimeout(300);

  // ---------- 输入框翻译 ----------
  await page.locator('#ta').click();
  await page.keyboard.type('你好，我的朋友');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.getElementById('ta').value === 'Hello, my friend!', null, { timeout: 10000 });
  check('输入框连按三下空格翻译成英文', true);
  await page.keyboard.press('Control+z');
  const undone = await page.locator('#ta').inputValue();
  check('Ctrl+Z 撤销输入框翻译', undone.startsWith('你好，我的朋友'), JSON.stringify(undone));
  await page.locator('#ce').click();
  await page.keyboard.type('谢谢');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.getElementById('ce').innerText.trim() === 'Hello, my friend!', null, { timeout: 10000 });
  check('富文本编辑框（contenteditable）也能翻译', true);

  // ---------- 悬停翻译 ----------
  const p1 = await page.locator('#p1').boundingBox();
  await page.mouse.move(p1.x + 30, p1.y + 8);
  await page.keyboard.down('Control');
  await page.keyboard.up('Control');
  await page.locator('#p1 tx-translation[data-tx-state="done"]').waitFor({ timeout: 10000 });
  check('悬停段落按 Ctrl：只翻译这一段', (await page.locator('tx-translation').count()) === 1);
  await page.keyboard.down('Control');
  await page.keyboard.press('c');
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  check('Ctrl+C 等组合键不会触发', (await page.locator('tx-translation').count()) === 1);
  await page.keyboard.down('Control');
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  check('再按一次 Ctrl 收起', (await page.locator('tx-translation').count()) === 0);

  // ---------- 自动翻译外语网页 ----------
  await setSettings({ autoTranslateForeign: true });
  const fp = await ctx.newPage();
  await fp.goto(`${base}/foreign`);
  await fp.locator('#f1 tx-translation[data-tx-state="done"]').waitFor({ timeout: 10000 });
  check('自动翻译外语网页', true);
  const cp = await ctx.newPage();
  await cp.goto(`${base}/chinese`);
  await cp.waitForTimeout(2500);
  check('中文网页不自动翻译', (await cp.locator('tx-translation').count()) === 0);

  // ---------- 用量统计 ----------
  await page.waitForTimeout(3500);
  const usage = await options.evaluate(async () => (await chrome.storage.local.get('usage')).usage ?? {});
  const today = Object.values(usage).at(-1) ?? {};
  check('记录用量（请求数、token）', today['custom/mock']?.requests > 0 && today['custom/mock']?.inputTokens > 0, JSON.stringify(today));
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await ctx.close();
  server.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
