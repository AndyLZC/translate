# AI 双语翻译

用大模型把网页、YouTube 字幕翻译成双语对照，并能边读边学（句子解析、查词、生词本）的浏览器扩展。支持 Chrome / Edge / Firefox（含安卓版 Firefox）。

## 功能

**翻译**
- **网页双语对照**：译文显示在每段原文下方，可切换「只看译文 / 只看原文」；链接、加粗、行内代码等格式保留
- **省钱省时**：多段合并成一个请求；只翻译可视区域；已是目标语言的段落跳过；结果本地缓存
- **动态页面**：无限滚动、单页应用切换的新内容自动翻译
- **YouTube 双语字幕**：人工/自动字幕都支持，合并成完整句子再翻译，全屏可用；可导出双语 SRT
- **划词翻译**：选中文字弹出译文；选中单个单词显示音标、释义、例句
- **输入框翻译**：在聊天框、评论框里连按三下空格，把写好的中文翻译成英文（Ctrl/⌘+Z 撤销）
- **悬停翻译**：鼠标停在段落上单独按一下 Ctrl，只翻译这一段
- **自动翻译外语网页**（可选）、总是翻译某些网站、站点规则

**学习**
- **句子解析**：译文后点「解析」，查看句子结构、重点词汇、短语搭配、语法要点，并可「追问 AI」
- **YouTube 学习**：点击字幕暂停视频并解析这一句
- **生词本**：划词卡片、解析面板里点 ♥ 收藏，设置页查看、搜索、导出 CSV（可导入 Anki）

**模型与数据**
- **多家模型**：OpenAI、DeepSeek、Claude（默认 Haiku 4.5）、任意 OpenAI 兼容接口（OpenRouter、Ollama 等），各自保存 Key，随时切换
- **设置自动备份**：设置（含 API Key）加密编码后存进一个书签「AI 双语翻译 · 设置备份（请勿删除）」，卸载重装插件后自动恢复（浏览器卸载扩展时会清空扩展自己的存储，但不会删书签）；也可导入/导出文件
- **用量统计**：每天每个模型的请求数和 token 数

## 安装

```bash
npm install
npm run build          # Chrome / Edge，产物在 .output/chrome-mv3
npm run build:firefox  # Firefox（MV3，含安卓版），产物在 .output/firefox-mv3
```

- **Chrome / Edge**：打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`
- **Firefox**：`about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选择 `.output/firefox-mv3/manifest.json`
- **升级**：把新版本解压覆盖原文件夹，在扩展管理页点刷新。扩展 ID 已固定（`khfhjjhjhclfaaabnjnecemgknfloohp`），即使删除后重装，设置和 API Key 也会从书签备份自动恢复

### 手机上使用

- **Android**：Firefox for Android 支持扩展（需从 addons.mozilla.org 安装，或用 Firefox Nightly 的自定义附加组件集合）；手机版 Chrome 不支持扩展
- **iPhone / iPad**：Safari 扩展需要在 Mac 上用 Xcode 打包成 App
- 已适配触屏：长按选词即可划词翻译，解析面板在手机上是底部弹层

## 开发

```bash
npm run dev        # 带热更新的 Chrome（WXT）
npm test           # 单元测试（Vitest + happy-dom）
npm run compile    # 类型检查
npm run test:e2e   # 端到端测试：真实 Chromium + 模拟模型接口 + 模拟 YouTube 播放器
```

### 目录结构

```
src/
├─ entrypoints/
│  ├─ background.ts          # 翻译请求、模型调用、设置备份、用量、快捷键、右键菜单
│  ├─ content/               # 网页内容脚本入口 + 译文样式
│  ├─ youtube-main.content.ts# YouTube 页面环境：拦截播放器的字幕请求
│  ├─ youtube.content/       # YouTube 双语字幕入口
│  ├─ popup/                 # 工具栏弹窗（React + shadcn/ui）
│  └─ options/               # 设置页（React + shadcn/ui，侧边栏导航）
├─ background/               # 翻译服务、提示词、模型接入、缓存、用量
├─ content/
│  ├─ extractor.ts / serializer.ts / renderer.ts   # 段落识别、格式占位符、渲染
│  ├─ controller.ts / viewport.ts / dom-watcher.ts # 整页翻译调度
│  ├─ selection.ts           # 划词翻译、查词卡片
│  ├─ analysis-panel.ts      # 句子解析面板、追问
│  ├─ input-translate.ts     # 输入框翻译
│  ├─ hover-translate.ts     # 悬停翻译
│  └─ ui/                    # 页面浮层（Shadow DOM）：样式、图标、Markdown 渲染
├─ youtube/                  # 字幕解析断句、播放器叠加层、SRT 导出
├─ components/ui/            # shadcn/ui 组件（Radix + Tailwind）
└─ lib/                      # 设置、备份、生词本、消息协议、站点规则、语言检测
```

### 关键设计

1. **API 只由 background 调用**：避开跨域，API Key 不暴露给网页，所有标签页共用请求队列和缓存
2. **批量 + 编号**：每个请求默认最多 12 段，用 `<seg id="N">` 包裹；漏掉的段落单独补翻
3. **占位符**：`<a>链接</a>` → `<x0>链接</x0>`，翻译后还原；标签乱了退回纯文本
4. **页面浮层都在 Shadow DOM 里**：不受网站 CSS 影响；模型输出只用 textContent 渲染，不执行 HTML
5. **设置备份**：主备份是一个书签（AES-GCM 编码，卸载扩展不受影响），辅以 `storage.sync`（按字节切块，每项 8KB 上限）；本地为空时自动恢复

## 已知限制

- 「只看译文」只对整段生效
- 只翻译顶层页面，不翻译 iframe
- YouTube 字幕依赖播放器未公开的接口；没有字幕的视频暂不支持；Shorts 未适配
- 书签备份里的加密密钥在扩展代码中，只能防止被一眼看到，不等于强加密；手机版 Firefox 没有书签接口，只能用导出文件备份
