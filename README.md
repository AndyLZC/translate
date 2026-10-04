# AI 双语翻译

用大模型把网页翻译成双语对照的浏览器扩展（Chrome / Edge / Firefox）。

- **双语对照**：译文显示在每段原文下方，也可切换成"只看译文"或"只看原文"
- **保留格式**：链接、加粗、斜体、行内代码、换行在译文里原样保留，链接可点击
- **省钱省时**：多段合并成一个请求按编号返回；只翻译可视区域（多预留一屏）；已经是目标语言的段落直接跳过；结果缓存在本地
- **动态页面**：无限滚动、单页应用切换、评论展开等新内容自动翻译，原文变了会重新翻译
- **站点规则**：X/Twitter、GitHub、Reddit、Hacker News、Wikipedia、Stack Overflow、YouTube 评论有内置规则，可在设置页用 JSON 覆盖或新增
- **模型**：OpenAI 官方接口，或任何 OpenAI 兼容接口（DeepSeek、OpenRouter、本地 Ollama 等）

## 安装（开发版）

```bash
npm install
npm run build          # Chrome/Edge，产物在 .output/chrome-mv3
npm run build:firefox  # Firefox，产物在 .output/firefox-mv2
```

Chrome：打开 `chrome://extensions` → 开启"开发者模式" → "加载已解压的扩展程序" → 选择 `.output/chrome-mv3`。

Firefox：打开 `about:debugging#/runtime/this-firefox` → "临时载入附加组件" → 选择 `.output/firefox-mv2/manifest.json`。

首次安装会自动打开设置页：填入 OpenAI API Key，点"测试连接"确认可用。

## 使用

- 点页面右下角的「译」悬浮按钮，或按 `Alt+A`，或在扩展弹窗里点"翻译此页面"
- 鼠标移到悬浮按钮上可切换 双语 / 译文 / 原文
- 弹窗里可设置"总是翻译这个网站"
- 某段失败时，点该段的"翻译失败，点击重试"，或点悬浮按钮旁的进度条重试全部失败段落

## 开发

```bash
npm run dev        # 启动带热更新的 Chrome（WXT）
npm test           # 单元测试（Vitest + happy-dom）
npm run compile    # 类型检查
npm run test:e2e   # 端到端测试：真实 Chromium 加载扩展 + 模拟 OpenAI 接口
```

### 目录结构

```
src/
├─ entrypoints/
│  ├─ background.ts        # Service Worker：接收翻译请求、调用模型、快捷键、右键菜单
│  ├─ content/             # 内容脚本入口 + 译文样式
│  ├─ popup/               # 工具栏弹窗（React）
│  └─ options/             # 设置页（React）
├─ background/
│  ├─ translation-service.ts  # 缓存 → 去重 → 打包 → p-queue 排队限流 → 漏段补翻
│  ├─ prompt.ts            # 系统提示词、编号打包、解析模型输出
│  ├─ provider.ts          # 模型接入（Vercel AI SDK）
│  └─ cache.ts             # Dexie (IndexedDB) 翻译缓存
├─ content/
│  ├─ extractor.ts         # 段落识别：块级元素里的连续行内内容 = 一个翻译单元
│  ├─ serializer.ts        # 行内格式 ↔ <x0>…</x0> 占位符
│  ├─ renderer.ts          # 插入译文、加载中/失败状态
│  ├─ viewport.ts          # IntersectionObserver：只翻译看得到的部分
│  ├─ dom-watcher.ts       # MutationObserver：动态内容
│  ├─ controller.ts        # 总控
│  └─ floating-button.ts   # Shadow DOM 悬浮按钮
└─ lib/                    # 设置、消息协议、站点规则、语言检测
```

### 关键设计

1. **API 只由 background 调用**：避开跨域，API Key 不暴露给网页，所有标签页共用一个请求队列和缓存。
2. **批量 + 编号**：每个请求默认最多 12 段 / 3000 字符，用 `<seg id="N">` 包裹；返回的段数对不上时，只把漏掉的段落单独重发。
3. **占位符**：`<a href>链接</a>` → `<x0>链接</x0>`，翻译后还原；模型弄乱标签时退回纯文本，保证页面不坏。
4. **缓存键**：`hash(提示词版本 + 接口地址 + 模型 + 目标语言 + 系统提示词 + 原文)`，改了术语表或提示词会自动用新缓存。

### 站点规则示例

```json
[
  {
    "name": "example",
    "matches": ["example.com"],
    "blocks": [".post-title", ".comment-body"],
    "exclude": [".sidebar", ".author", "time"],
    "roots": ["main"]
  }
]
```

- `blocks`：强制把匹配元素整体当作一段（内部结构零碎时用）
- `exclude`：不翻译
- `roots`：只翻译这些容器内的内容
- `name` 与内置规则相同时覆盖内置规则

## 已知限制

- "只看译文"只对整段生效；段落里夹着子段落的零散文字仍是双语显示
- 只翻译顶层页面，不翻译 iframe 内的内容
- YouTube 字幕翻译还没做（下一阶段）
