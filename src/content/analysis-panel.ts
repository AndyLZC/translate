import type { ChatTurn } from '@/lib/messaging';
import { streamRequest, type StreamRequest } from '@/lib/stream';
import { addNote, hasNote, removeNoteByText } from '@/lib/notebook';
import { extractArticle, readingMinutes } from './article';
import { copyText, h, icon, iconButton, speak, toast, uiRoot } from './ui/host';
import { renderMarkdown, splitSections } from './ui/markdown';

export interface AnalyzeTarget {
  /** 原文 */
  text: string;
  /** 页面上已有的译文（没有则用解析里的【译文】） */
  translation?: string;
}

/** 面板里追问时带给模型的原文上限：总结的正文很长，只带前面一部分 */
const FOLLOW_UP_CONTEXT_CHARS = 12000;

interface PanelOptions {
  title: string;
  /** 正文上方的卡片：解析是原句 + 译文，总结是文章标题 + 字数 */
  card: HTMLElement;
  sectionTitle: string;
  request: StreamRequest;
  /** 追问时作为「原文」带给模型 */
  context: string;
  placeholder: string;
  /** 标题栏里额外的按钮（朗读、收藏…），放在复制按钮前面 */
  buttons?: (state: { analysis: () => string }) => HTMLElement[];
  /** 每次流式更新时先处理全文，返回要渲染的部分（解析把【译文】拿出来放到卡片里） */
  transform?: (full: string, streaming: boolean) => string | null;
  copyPrefix: string;
}

/**
 * 学习模式的解析面板、全文总结面板：顶部卡片 + 流式生成的内容，可追问。
 * 桌面端显示在右侧，手机上是底部弹层。
 */
export class AnalysisPanel {
  private layer: HTMLElement | null = null;
  /** 正在进行的流式请求；关闭面板时取消，省 token */
  private aborts: (() => void)[] = [];
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  get isOpen() {
    return !!this.layer?.isConnected;
  }

  close() {
    this.aborts.forEach((a) => a());
    this.aborts = [];
    this.layer?.remove();
    this.layer = null;
    document.removeEventListener('keydown', this.onKey, true);
  }

  /** 解析一个句子或段落 */
  async open(target: AnalyzeTarget) {
    const text = target.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const trEl = h('div', { class: 'tr', text: target.translation ?? '' });
    const card = h('div', { class: 'sentence' }, h('div', { class: 'orig', text }), trEl);

    await this.openPanel({
      title: text.split(' ').length > 1 ? '长难句解析' : '单词解析',
      card,
      sectionTitle: '解析',
      request: { type: 'analyze', text, translation: target.translation },
      context: text,
      placeholder: '追问 AI，例如：what 在这里是什么用法？',
      copyPrefix: `${text}\n${trEl.textContent ?? ''}`,
      buttons: ({ analysis }) => {
        const saveBtn = iconButton('heart', '收藏到生词本', async () => {
          if (saveBtn.classList.contains('on')) {
            await removeNoteByText('sentence', text);
            saveBtn.classList.remove('on');
            toast('已从生词本移除');
            return;
          }
          await addNote({ type: 'sentence', text, meaning: trEl.textContent ?? '', analysis: analysis(), url: location.href, title: document.title });
          saveBtn.classList.add('on');
          toast('已收藏到生词本（设置页可查看、导出）');
        });
        void hasNote('sentence', text).then((on) => saveBtn.classList.toggle('on', on));
        return [iconButton('volume', '朗读原文', () => speak(text, document.documentElement.lang || undefined)), saveBtn];
      },
      // 【译文】放到顶部卡片里，其余小节渲染在下面
      transform: (full, streaming) => {
        const sections = splitSections(full);
        const tr = sections.find((sec) => sec.title === '译文');
        if (!target.translation && tr) trEl.textContent = tr.body;
        const rest = sections
          .filter((sec) => sec.title !== '译文')
          .map((sec) => (sec.title ? `【${sec.title}】\n${sec.body}` : sec.body))
          .join('\n\n');
        return !rest.trim() && streaming ? null : rest;
      },
    });
  }

  /** AI 总结当前页面 */
  async openSummary() {
    const article = extractArticle();
    if (!article) {
      toast('这个页面没有找到可以总结的正文');
      return;
    }
    const meta = [
      `约 ${article.words.toLocaleString()} ${/[a-z]/i.test(article.text.slice(0, 400)) ? '词' : '字'}`,
      `阅读约 ${readingMinutes(article.text)} 分钟`,
      article.truncated ? '较长，只总结了前面的主要部分' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const card = h('div', { class: 'sentence' }, h('div', { class: 'orig', text: article.title || location.hostname }), h('div', { class: 'tr', text: meta }));

    await this.openPanel({
      title: 'AI 总结',
      card,
      sectionTitle: '总结',
      request: { type: 'summarize', title: article.title, url: location.href, text: article.text, truncated: article.truncated },
      context: `${article.title}\n\n${article.text.slice(0, FOLLOW_UP_CONTEXT_CHARS)}`,
      placeholder: '追问这篇文章，例如：作者的主要依据是什么？',
      copyPrefix: `${article.title}\n${location.href}`,
    });
  }

  private async openPanel(opts: PanelOptions) {
    this.close();
    const root = uiRoot();
    const layer = h('div', { class: 'layer' });
    this.layer = layer;
    document.addEventListener('keydown', this.onKey, true);

    const analysisEl = h('div', { class: 'md' }, skeleton());
    const chatEl = h('div', { class: 'chat' });
    const body = h('div', { class: 'panel-body' }, opts.card, h('div', { class: 'sec-title', text: opts.sectionTitle }), analysisEl, chatEl);

    let analysis = '';
    const history: ChatTurn[] = [];

    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'title', text: opts.title }),
      ...(opts.buttons?.({ analysis: () => analysis }) ?? []),
      iconButton('copy', '复制', async () => {
        await copyText(`${opts.copyPrefix}\n\n${analysis}`);
        toast('已复制');
      }),
      iconButton('x', '关闭 (Esc)', () => this.close()),
    );
    // 收藏、朗读放在复制前面，关闭始终在最右
    const input = h('input', { attrs: { type: 'text', placeholder: opts.placeholder, enterkeyhint: 'send' } });
    const sendBtn = h('button', { class: 'btn', attrs: { type: 'button' } }, icon('send', 15), '追问');
    const foot = h('div', { class: 'panel-foot' }, input, sendBtn);

    const ask = async () => {
      const question = input.value.trim();
      if (!question || sendBtn.disabled || !analysis) return;
      input.value = '';
      sendBtn.disabled = true;
      chatEl.append(h('div', { class: 'bubble q', text: question }));
      const answer = h('div', { class: 'bubble a md' }, skeleton());
      chatEl.append(answer);
      answer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const req = streamRequest({ type: 'followUp', text: opts.context, analysis, history: [...history], question }, (_d, full) =>
        throttle(() => {
          answer.replaceChildren(renderMarkdown(full));
          addCaret(answer);
          answer.scrollIntoView({ block: 'nearest' });
        }),
      );
      this.aborts.push(req.abort);
      const res = await req.result;
      cancelThrottle();
      sendBtn.disabled = false;
      if (res.text) {
        history.push({ role: 'user', content: question }, { role: 'assistant', content: res.text });
        answer.replaceChildren(renderMarkdown(res.text));
      } else {
        answer.replaceChildren(h('span', { class: 'error', text: res.error ?? '请求失败' }));
      }
      answer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    sendBtn.addEventListener('click', ask);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 防止网站快捷键抢走按键
      if (e.key === 'Enter' && !e.isComposing) ask();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    const panel = h('div', { class: 'panel', attrs: { role: 'dialog', 'aria-label': opts.title } }, head, body, foot);
    const backdrop = h('div', { class: 'backdrop', on: { click: () => this.close() } });
    // 桌面端不遮挡页面，手机端加遮罩方便点击关闭
    if (window.matchMedia('(max-width: 640px)').matches) layer.append(backdrop);
    layer.append(panel);
    root.append(layer);

    // 边生成边显示：第一段文字通常一秒内就到
    const show = (full: string, streaming: boolean) => {
      const rest = opts.transform ? opts.transform(full, streaming) : full;
      if (rest == null) return; // 还没有可显示的部分，先保留骨架屏
      analysisEl.replaceChildren(renderMarkdown(rest));
      if (streaming) addCaret(analysisEl);
    };
    const req = streamRequest(opts.request, (_d, full) => throttle(() => show(full, true)));
    this.aborts.push(req.abort);
    const res = await req.result;
    if (this.layer !== layer) return;
    if (!res.text) {
      analysisEl.replaceChildren(h('div', { class: 'error', text: res.error ?? '请求失败' }));
      return;
    }
    analysis = res.text;
    cancelThrottle();
    show(res.text, false);
  }
}

/** 合并高频的流式更新：最多每 60ms 重绘一次 */
let pending: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
function throttle(fn: () => void) {
  pending = fn;
  timer ??= setTimeout(() => {
    timer = undefined;
    const f = pending;
    pending = null;
    f?.();
  }, 60);
}
function cancelThrottle() {
  clearTimeout(timer);
  timer = undefined;
  pending = null;
}

/** 在最后一行末尾显示闪烁的光标，表示还在生成 */
function addCaret(container: HTMLElement) {
  let target: Element = container;
  while (target.lastElementChild && !target.lastElementChild.classList.contains('caret')) target = target.lastElementChild;
  if (target.tagName === 'SPAN') target = target.parentElement ?? container;
  target.append(h('span', { class: 'caret' }));
}

function skeleton() {
  return h('div', { class: 'skeleton' }, h('i'), h('i'), h('i'));
}
