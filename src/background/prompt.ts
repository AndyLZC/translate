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

export function buildUserPrompt(texts: string[], context?: { title?: string }): string {
  const head = context?.title ? `Page title (for context only, do not translate): ${context.title}\n\n` : '';
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
