// 设置备份端到端测试：固定扩展 ID、设置变化写入同步存储、本地被清空后从同步存储恢复
// 用法：npm run build && node e2e/backup.mjs
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
  const id = sw.url().split('/')[2];
  // Playwright 会在扩展 API 绑定完成前就拿到 service worker；等它正常启动完再测
  await new Promise((r) => setTimeout(r, 1500));
  check('扩展 ID 固定', id === 'khfhjjhjhclfaaabnjnecemgknfloohp', id);

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.evaluate(() =>
    chrome.storage.local.set({ settings: { activeProvider: 'deepseek', providers: { deepseek: { apiKey: 'sk-test-123', baseURL: '', model: 'deepseek-chat' } } } }),
  );
  let written = false;
  for (let i = 0; i < 20 && !written; i++) {
    await page.waitForTimeout(500);
    written = await page.evaluate(async () => !!(await chrome.storage.sync.get('backup:meta'))['backup:meta']);
  }
  check('设置变化后写入同步存储', written);

  await page.evaluate(() => chrome.storage.local.clear());
  const res = await page.evaluate(
    () => new Promise((r) => chrome.runtime.sendMessage({ id: 1, type: 'restoreBackup', timestamp: Date.now() }, r)),
  );
  const restored = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  check('本地清空后从同步存储恢复 API Key', restored?.providers?.deepseek?.apiKey === 'sk-test-123' && restored.activeProvider === 'deepseek', JSON.stringify(res));
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await ctx.close();
}
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
