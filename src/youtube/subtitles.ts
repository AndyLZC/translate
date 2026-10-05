/**
 * YouTube 字幕解析与断句。
 *
 * 播放器拉取的字幕是 json3 格式（偶尔是 XML）：
 * - 人工字幕：每个 event 是一行完整字幕，但一句话常被拆成好几行
 * - 自动字幕（ASR）：每个 event 里是逐词的 segs（带 tOffsetMs），通常没有标点
 * 两种都先拆成带时间的 token，再合并成完整句子，翻译和显示都以句子为单位。
 */

export interface Token {
  start: number; // ms
  end: number; // ms
  text: string;
}

export interface Sentence {
  start: number; // ms
  /** 显示到什么时候（ms） */
  end: number;
  text: string;
}

export interface ParsedTrack {
  /** 是否自动生成字幕（逐词、通常无标点） */
  asr: boolean;
  tokens: Token[];
}

interface Json3 {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    aAppend?: number;
    segs?: { utf8?: string; tOffsetMs?: number }[];
  }[];
}

export function parseTimedText(raw: string, url = ''): ParsedTrack {
  const asrHint = /[?&]kind=asr\b/.test(url);
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) return parseJson3(JSON.parse(trimmed) as Json3, asrHint);
  if (trimmed.startsWith('<')) return parseXml(trimmed, asrHint);
  return { asr: asrHint, tokens: [] };
}

function parseJson3(data: Json3, asrHint: boolean): ParsedTrack {
  const tokens: Token[] = [];
  let wordLevel = false;
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.aAppend) continue;
    const start = ev.tStartMs ?? 0;
    const end = start + (ev.dDurationMs ?? 0);
    const segs = ev.segs.filter((s) => s.utf8 && s.utf8 !== '\n');
    if (!segs.length) continue;

    if (segs.length > 1 && segs.some((s) => s.tOffsetMs !== undefined)) {
      // 逐词：每个词一个 token，结束时间取下一个词的开始
      wordLevel = true;
      segs.forEach((s, i) => {
        const ws = start + (s.tOffsetMs ?? 0);
        const next = segs[i + 1];
        tokens.push({ start: ws, end: next ? start + (next.tOffsetMs ?? 0) : end, text: s.utf8! });
      });
    } else {
      const text = segs.map((s) => s.utf8).join('').replace(/\s*\n\s*/g, ' ').trim();
      if (text) tokens.push({ start, end, text });
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  return { asr: asrHint || wordLevel, tokens };
}

/** 旧版 XML：<text start="1.2" dur="3">…</text> 或 format 3 的 <p t="1200" d="3000">…</p> */
function parseXml(xml: string, asrHint: boolean): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const tokens: Token[] = [];
  for (const el of doc.querySelectorAll('text')) {
    const start = Math.round(parseFloat(el.getAttribute('start') ?? '0') * 1000);
    const dur = Math.round(parseFloat(el.getAttribute('dur') ?? '0') * 1000);
    const text = decodeEntities(el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) tokens.push({ start, end: start + dur, text });
  }
  for (const p of doc.querySelectorAll('p')) {
    const start = parseInt(p.getAttribute('t') ?? '0', 10);
    const end = start + parseInt(p.getAttribute('d') ?? '0', 10);
    const words = p.querySelectorAll('s');
    if (words.length > 1) {
      words.forEach((w, i) => {
        const ws = start + parseInt(w.getAttribute('t') ?? '0', 10);
        const next = words[i + 1];
        tokens.push({ start: ws, end: next ? start + parseInt(next.getAttribute('t') ?? '0', 10) : end, text: w.textContent ?? '' });
      });
    } else {
      const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) tokens.push({ start, end, text });
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  return { asr: asrHint, tokens };
}

function decodeEntities(s: string) {
  // 只取文本，不会执行任何标签
  return new DOMParser().parseFromString(`<!doctype html><body>${s}`, 'text/html').body.textContent ?? '';
}

const SENTENCE_END = /[.!?。！？…][\s"'”’)\]]*$/;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export interface SegmentOptions {
  /** 两个 token 之间停顿超过这个时长就断句（ms） */
  pauseMs: number;
  /** 句子长度超过这个字符数，遇到较小停顿也断句 */
  softMaxChars: number;
  /** 绝对上限：超过就强制断句 */
  hardMaxChars: number;
}

export const MANUAL_OPTIONS: SegmentOptions = { pauseMs: 1500, softMaxChars: 160, hardMaxChars: 260 };
export const ASR_OPTIONS: SegmentOptions = { pauseMs: 800, softMaxChars: 90, hardMaxChars: 140 };

/** 把 token 合并成句子：遇到句末标点、长停顿或超长时断开 */
export function segment(track: ParsedTrack, opts = track.asr ? ASR_OPTIONS : MANUAL_OPTIONS): Sentence[] {
  const out: Sentence[] = [];
  let cur: Token[] = [];

  const join = (tokens: Token[]) => {
    let s = '';
    for (const t of tokens) {
      const piece = t.text.replace(/\s+/g, ' ');
      if (!s) s = piece.trimStart();
      // 自带前导空格、或中日韩文字交界处，直接拼；否则补一个空格
      else if (/^\s/.test(piece) || /\s$/.test(s) || CJK.test(s.slice(-1)) || CJK.test(piece[0] ?? '')) s += piece;
      else s += ' ' + piece;
    }
    return s.replace(/\s+/g, ' ').trim();
  };

  const flush = () => {
    if (!cur.length) return;
    const text = join(cur);
    if (text) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text });
    cur = [];
  };

  track.tokens.forEach((tok, i) => {
    // 加上这个词就超过绝对上限：先把前面的断开
    if (cur.length && join([...cur, tok]).length > opts.hardMaxChars) flush();
    cur.push(tok);
    const next = track.tokens[i + 1];
    const text = join(cur);
    const gap = next ? next.start - tok.end : Infinity;
    const len = text.length;
    if (
      !next ||
      SENTENCE_END.test(text) ||
      gap >= opts.pauseMs ||
      len >= opts.hardMaxChars ||
      (len >= opts.softMaxChars && gap >= Math.min(250, opts.pauseMs / 3))
    ) {
      flush();
    }
  });
  flush();

  // 句子之间的短空档里继续显示上一句，避免字幕闪烁
  for (let i = 0; i < out.length - 1; i++) {
    const gap = out[i + 1].start - out[i].end;
    if (gap > 0 && gap < 1500) out[i].end = out[i + 1].start;
    if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
  }
  return out;
}

/** 二分查找当前时间所在的句子 */
export function findSentenceIndex(sentences: Sentence[], timeMs: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = sentences[mid];
    if (timeMs < s.start) hi = mid - 1;
    else if (timeMs >= s.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** 从字幕请求地址里取视频 id 和语言 */
export function trackInfo(url: string) {
  try {
    const u = new URL(url, 'https://www.youtube.com');
    return {
      videoId: u.searchParams.get('v') ?? '',
      lang: u.searchParams.get('lang') ?? '',
      /** YouTube 自带的机器翻译目标语言 */
      tlang: u.searchParams.get('tlang') ?? '',
      asr: u.searchParams.get('kind') === 'asr',
    };
  } catch {
    return { videoId: '', lang: '', tlang: '', asr: false };
  }
}

/** 当前页面的视频 id（watch、embed、shorts 都支持） */
export function currentVideoId(loc: Location = location): string {
  const u = new URL(loc.href);
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
  return m?.[1] ?? '';
}

function srtTime(ms: number) {
  const p = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  return `${p(ms / 3_600_000)}:${p((ms / 60_000) % 60)}:${p((ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** 导出 SRT：每条字幕两行（原文 + 译文），没有译文的只放原文 */
export function toSrt(lines: { start: number; end: number; text: string; translation?: string }[], mode: 'bilingual' | 'translation' = 'bilingual'): string {
  return lines
    .map((l, i) => {
      const body = mode === 'translation' ? l.translation || l.text : [l.text, l.translation].filter(Boolean).join('\n');
      return `${i + 1}\n${srtTime(l.start)} --> ${srtTime(Math.max(l.end, l.start + 500))}\n${body}\n`;
    })
    .join('\n');
}
