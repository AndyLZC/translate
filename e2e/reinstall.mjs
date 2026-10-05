// 卸载重装端到端测试：在同一个浏览器配置里设置 DeepSeek → 卸载扩展 → 重新安装，
// 检查 API Key 和当前服务商是否自动恢复（浏览器会清空扩展存储，靠书签备份找回）。
// 用法：npm run build && node e2e/reinstall.mjs
import fs from 'node:fs';
import os from 'node:os';
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-translate-profile-'));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
};

async function withExtension(fn) {
  const ctx = await playwright.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    sw ??= await ctx.waitForEvent('serviceworker');
    // Playwright 会在扩展 API 绑定完成前拿到 service worker，等它启动完
    await new Promise((r) => setTimeout(r, 2000));
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${sw.url().split('/')[2]}/options.html`);
    await fn(page);
  } finally {
    await ctx.close().catch(() => {});
  }
}

try {
  await withExtension(async (page) => {
    await page.evaluate(() =>
      chrome.storage.local.set({
        settings: { activeProvider: 'deepseek', providers: { deepseek: { apiKey: 'sk-keep-me', baseURL: '', model: 'deepseek-flash' } } },
      }),
    );
    let bookmark = null;
    for (let i = 0; i < 20 && !bookmark; i++) {
      await page.waitForTimeout(500);
      bookmark = (await page.evaluate(() => chrome.bookmarks.search({ query: 'ai-translate.invalid/backup' })))[0] ?? null;
    }
    check('设置变化后写入书签备份', !!bookmark, bookmark?.title);
    check('书签里看不到明文 API Key', !!bookmark && !bookmark.url.includes('sk-keep-me'));
    // 卸载会关闭扩展页面
    await page.evaluate(() => chrome.management.uninstallSelf({ showConfirmDialog: false })).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  });

  await withExtension(async (page) => {
    const syncKeys = Object.keys(await page.evaluate(() => chrome.storage.sync.get(null)));
    const settings = (await page.evaluate(() => chrome.storage.local.get('settings'))).settings;
    check('卸载重装后自动恢复 DeepSeek 设置和 API Key', settings?.activeProvider === 'deepseek' && settings?.providers?.deepseek?.apiKey === 'sk-keep-me' && settings?.providers?.deepseek?.model === 'deepseek-flash', JSON.stringify({ active: settings?.activeProvider, syncKeysAfterReinstall: syncKeys.length }));
  });
} catch (e) {
  failures++;
  console.error(e);
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
