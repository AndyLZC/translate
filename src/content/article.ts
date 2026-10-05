import { Readability } from '@mozilla/readability';
import { OWN_TAGS } from './dom';

export interface Article {
  title: string;
  /** 正文纯文本，段落之间空一行 */
  text: string;
  /** 正文太长时只取前面一部分 */
  truncated: boolean;
  /** 英文按词数，中日韩按字数 */
  words: number;
}

/** 发给模型的正文上限（字符），大约 6000–8000 token，足够覆盖一篇长文的主体 */
export const MAX_ARTICLE_CHARS = 24000;

/**
 * 提取当前页面的正文：用 Readability（Firefox 阅读模式同款算法）去掉导航、广告、评论，
 * 在页面副本上运行，并先删掉插件自己插入的译文，不影响页面本身。提取不到时退回整页可见文字。
 */
export function extractArticle(doc: Document = document): Article | null {
  let title = doc.title.trim();
  let text = '';
  try {
    const clone = doc.cloneNode(true) as Document;
    clone.querySelectorAll([...OWN_TAGS].map((t) => t.toLowerCase()).join(',')).forEach((el) => el.remove());
    const parsed = new Readability(clone, { charThreshold: 300 }).parse();
    if (parsed?.textContent) {
      text = parsed.textContent;
      title = parsed.title?.trim() || title;
    }
  } catch {
    /* 退回整页文字 */
  }
  if (normalize(text).length < 200) {
    const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
    body?.querySelectorAll([...OWN_TAGS].map((t) => t.toLowerCase()).join(',') + ',script,style,noscript,nav,footer').forEach((el) => el.remove());
    text = body?.innerText || body?.textContent || '';
  }
  text = normalize(text);
  if (text.length < 80) return null;
  const truncated = text.length > MAX_ARTICLE_CHARS;
  if (truncated) text = text.slice(0, MAX_ARTICLE_CHARS);
  return { title, text, truncated, words: countWords(text) };
}

function normalize(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function countWords(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const latin = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return cjk + latin;
}

/** 预计阅读时间（分钟）：英文约 220 词/分钟，中文约 400 字/分钟 */
export function readingMinutes(text: string): number {
  const cjk = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const rest = countWords(text) - cjk;
  return Math.max(1, Math.round(cjk / 400 + rest / 220));
}
