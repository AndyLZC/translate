import type { Settings } from '@/lib/settings';

/** 改动提示词规则时递增，让旧缓存失效 */
export const PROMPT_VERSION = 1;

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-CN': 'Simplified Chinese (简体中文)',
  'zh-TW': 'Traditional Chinese (繁體中文)',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

export function languageName(code: string) {
  return LANGUAGE_NAMES[code] ?? code;
}

export function buildSystemPrompt(s: Pick<Settings, 'targetLang' | 'customPrompt' | 'glossary'>): string {
  const lang = languageName(s.targetLang);
  const parts = [
    `You are a professional translator. Translate web page text into ${lang}.`,
    '',
    'Rules:',
    '1. The input is a list of segments, each wrapped as <seg id="N">...</seg>. Return every segment, in the same order, wrapped in the same <seg id="N"> tag with the same id. One output segment per input segment: never merge, split, skip or reorder them.',
    '2. Tags such as <x0>...</x0> and <x1/> are formatting placeholders (links, bold text, images, line breaks, code). Keep every placeholder exactly as written, with the same number, and put the paired ones around the corresponding translated words. Never invent new placeholders.',
    '3. Keep URLs, code, file names, @mentions, #hashtags, numbers and emoji as they are. Keep well-known product and brand names in their original form.',
    '4. &lt; &gt; &amp; are escaped characters; keep them escaped.',
    `5. Write natural, fluent ${lang} that is faithful to the source. Output only the translations: no explanations, notes or quotes around them.`,
    `6. If a segment is already in ${lang} or has nothing to translate, return it unchanged.`,
  ];
  const glossary = parseGlossary(s.glossary);
  if (glossary.length) {
    parts.push('', 'Glossary (always use these translations):');
    for (const [src, dst] of glossary) parts.push(`- ${src} → ${dst}`);
  }
  if (s.customPrompt.trim()) parts.push('', 'Additional instructions:', s.customPrompt.trim());
  return parts.join('\n');
}

export function parseGlossary(text: string): [string, string][] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.search(/[=＝→]/);
      return i > 0 ? ([l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]) : null;
    })
    .filter((x): x is [string, string] => !!x && !!x[0] && !!x[1]);
}

export function buildUserPrompt(texts: string[], context?: { title?: string }, kind: 'page' | 'subtitle' = 'page'): string {
  let head = '';
  if (kind === 'subtitle') {
    head += `These segments are consecutive subtitle lines from a video${context?.title ? ` titled "${context.title}"` : ''}. They may be automatically transcribed: fix obvious transcription errors silently, use the surrounding lines for context, and keep each translation concise enough to read as a subtitle.\n\n`;
  } else if (context?.title) {
    head += `Page title (for context only, do not translate): ${context.title}\n\n`;
  }
  return head + texts.map((t, i) => `<seg id="${i + 1}">${t}</seg>`).join('\n');
}

/** 解析模型输出：按编号取回各段；缺失的编号不出现在结果里 */
export function parseSegments(output: string, count: number): Map<number, string> {
  const result = new Map<number, string>();
  const re = /<seg\s+id\s*=\s*["']?(\d+)["']?\s*>([\s\S]*?)(?:<\/seg>|(?=<seg\s+id\s*=)|$)/g;
  for (const m of output.matchAll(re)) {
    const id = Number(m[1]);
    const text = m[2].trim();
    if (id >= 1 && id <= count && text && !result.has(id)) result.set(id, text);
  }
  // 单段请求时，模型偶尔不带 <seg> 包裹直接给译文
  if (count === 1 && result.size === 0) {
    const text = output.replace(/<\/?seg[^>]*>/g, '').trim();
    if (text) result.set(1, text);
  }
  return result;
}

/** 划词翻译、输入框翻译：单段文字，直接输出译文 */
export function buildTextPrompt(
  s: Pick<Settings, 'customPrompt' | 'glossary'>,
  targetLang: string,
  mode: 'selection' | 'input',
): string {
  const lang = languageName(targetLang);
  const parts = [
    `You are a professional translator. Translate the user's text into ${lang}.`,
    'Keep the original meaning, tone, formatting and line breaks. Keep URLs, code, @mentions, numbers and emoji unchanged.',
    'Output only the translation: no explanations, notes, quotes or labels.',
  ];
  if (mode === 'input') {
    parts.push(
      `The user typed this text into a chat box, comment field or email. Write natural, idiomatic ${lang} that a native speaker would send, at the same level of formality.`,
    );
  }
  const glossary = parseGlossary(s.glossary);
  if (glossary.length) {
    parts.push('', 'Glossary (always use these translations):');
    for (const [src, dst] of glossary) parts.push(`- ${src} → ${dst}`);
  }
  if (s.customPrompt.trim() && mode === 'selection') parts.push('', 'Additional instructions:', s.customPrompt.trim());
  return parts.join('\n');
}

/** 划词选中单个词时，按词典格式解释 */
export function buildDictionaryPrompt(targetLang: string): string {
  const lang = languageName(targetLang);
  return [
    `You are a concise bilingual dictionary. Explain the word or short phrase the user gives, writing explanations in ${lang}.`,
    'Reply in plain text (no markdown), at most 7 lines:',
    'Line 1: the word, then its pronunciation (IPA for English words, pinyin for Chinese).',
    'Next lines: one line per part of speech, formatted as "pos. meaning; meaning" (at most 4 lines).',
    `Last line: "例：" followed by one short example sentence in the original language and its ${lang} translation.`,
  ].join('\n');
}

/** 是否按「查词」处理：不含空格的单个词，或很短的中日韩词语 */
export function isSingleWord(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(t)) return t.length <= 6 && /^[\p{L}]+$/u.test(t);
  return t.length <= 32 && /^\p{L}[\p{L}'’-]*$/u.test(t);
}

/** 学习模式：长难句解析。固定的分节格式，方便插件渲染 */
export function buildAnalysisPrompt(targetLang: string): string {
  const lang = languageName(targetLang);
  return [
    `You are an experienced language teacher. The user is a ${lang} speaker learning the language of the passage they send. Explain it in ${lang}.`,
    'If the passage has several sentences, translate all of it but focus the structure analysis on the one or two hardest sentences.',
    'Reply using exactly these sections, each starting with its heading on its own line, and nothing else:',
    '【译文】a natural, faithful translation.',
    '【句子结构】the main clause first ("**主语**：…", "**谓语**：…", "**宾语/表语**：…"), then each clause or long modifier as a "- " list item saying what it is and what it modifies.',
    '【重点词汇】3-6 of the harder words as "- word /IPA/ pos. meaning（in context）".',
    '【短语搭配】useful phrases or collocations as "- phrase：meaning". Omit this section if there are none.',
    '【语法要点】1-3 short "- " items on the grammar worth learning here.',
    'Use **bold** only for labels. No other markdown, no greetings, no closing remarks.',
  ].join('\n');
}

/** 追问：基于解析继续回答 */
export function buildFollowUpPrompt(targetLang: string): string {
  const lang = languageName(targetLang);
  return [
    `You are an experienced language teacher helping a ${lang} speaker understand a passage. You already gave the analysis in the conversation.`,
    `Answer the learner's follow-up questions in ${lang}, concisely and concretely, quoting the original words when helpful.`,
    'Plain text; "- " lists and **bold** are allowed, no other markdown.',
  ].join('\n');
}
