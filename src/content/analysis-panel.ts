import { sendMessage, type ChatTurn } from '@/lib/messaging';
import { addNote, hasNote, removeNoteByText } from '@/lib/notebook';
import { copyText, h, icon, iconButton, speak, toast, uiRoot } from './ui/host';
import { renderMarkdown, splitSections } from './ui/markdown';

export interface AnalyzeTarget {
  /** 原文 */
  text: string;
  /** 页面上已有的译文（没有则用解析里的【译文】） */
  translation?: string;
}

/**
 * 学习模式的解析面板：原文 + 译文 + 句子结构/重点词汇/语法要点，可追问。
 * 桌面端显示在右侧，手机上是底部弹层。
 */
export class AnalysisPanel {
  private layer: HTMLElement | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  get isOpen() {
    return !!this.layer?.isConnected;
  }

  close() {
    this.layer?.remove();
    this.layer = null;
    document.removeEventListener('keydown', this.onKey, true);
  }

  async open(target: AnalyzeTarget) {
    this.close();
    const text = target.text.replace(/\s+/g, ' ').trim();
    if (!text) return;

    const root = uiRoot();
    const layer = h('div', { class: 'layer' });
    this.layer = layer;
    document.addEventListener('keydown', this.onKey, true);

    const trEl = h('div', { class: 'tr', text: target.translation ?? '' });
    const sentence = h(
      'div',
      { class: 'sentence' },
      h('div', { class: 'orig', text }),
      trEl,
    );
    const analysisEl = h('div', { class: 'md' }, skeleton());
    const chatEl = h('div', { class: 'chat' });
    const body = h('div', { class: 'panel-body' }, sentence, h('div', { class: 'sec-title', text: '解析' }), analysisEl, chatEl);

    let analysis = '';
    const history: ChatTurn[] = [];

    const saveBtn = iconButton('heart', '收藏到生词本', async () => {
      if (saveBtn.classList.contains('on')) {
        await removeNoteByText('sentence', text);
        saveBtn.classList.remove('on');
        toast('已从生词本移除');
        return;
      }
      await addNote({
        type: 'sentence',
        text,
        meaning: trEl.textContent ?? '',
        analysis,
        url: location.href,
        title: document.title,
      });
      saveBtn.classList.add('on');
      toast('已收藏到生词本（设置页可查看、导出）');
    });
    void hasNote('sentence', text).then((on) => saveBtn.classList.toggle('on', on));

    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'title', text: text.split(' ').length > 1 ? '长难句解析' : '单词解析' }),
      iconButton('volume', '朗读原文', () => speak(text, document.documentElement.lang || undefined)),
      iconButton('copy', '复制解析', async () => {
        await copyText(`${text}\n${trEl.textContent ?? ''}\n\n${analysis}`);
        toast('已复制');
      }),
      saveBtn,
      iconButton('x', '关闭 (Esc)', () => this.close()),
    );

    const input = h('input', {
      attrs: { type: 'text', placeholder: '追问 AI，例如：what 在这里是什么用法？', enterkeyhint: 'send' },
    });
    const sendBtn = h('button', { class: 'btn', attrs: { type: 'button' } }, icon('send', 15), '追问');
    const foot = h('div', { class: 'panel-foot' }, input, sendBtn);

    const ask = async () => {
      const question = input.value.trim();
      if (!question || sendBtn.disabled || !analysis) return;
      input.value = '';
      sendBtn.disabled = true;
      chatEl.append(h('div', { class: 'bubble q', text: question }));
      const answer = h('div', { class: 'bubble a' }, skeleton());
      chatEl.append(answer);
      answer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const res = await sendMessage('followUp', { text, analysis, history, question }).catch((e) => ({ error: String(e), text: undefined }));
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

    const panel = h('div', { class: 'panel', attrs: { role: 'dialog', 'aria-label': '解析' } }, head, body, foot);
    const backdrop = h('div', { class: 'backdrop', on: { click: () => this.close() } });
    // 桌面端不遮挡页面，手机端加遮罩方便点击关闭
    if (window.matchMedia('(max-width: 640px)').matches) layer.append(backdrop);
    layer.append(panel);
    root.append(layer);

    const res = await sendMessage('analyze', { text }).catch((e) => ({ error: String(e), text: undefined }));
    if (this.layer !== layer) return;
    if (!res.text) {
      analysisEl.replaceChildren(h('div', { class: 'error', text: res.error ?? '解析失败' }));
      return;
    }
    analysis = res.text;
    const sections = splitSections(res.text);
    const tr = sections.find((s) => s.title === '译文');
    if (!target.translation && tr) trEl.textContent = tr.body;
    const rest = sections.filter((s) => s.title !== '译文').map((s) => (s.title ? `【${s.title}】\n${s.body}` : s.body)).join('\n\n');
    analysisEl.replaceChildren(renderMarkdown(rest));
  }
}

function skeleton() {
  return h('div', { class: 'skeleton' }, h('i'), h('i'), h('i'));
}
