import type { Settings, TranslationStyle } from '@/lib/settings';

/** 翻译风格预设对应的要求 */
const STYLE_RULES: Record<TranslationStyle, string> = {
  general: '',
  tech: 'Style: technical documentation. Use precise, standard technical terminology; keep code, API names, commands and widely used English technical terms in English (add the translated term in parentheses on first use when helpful).',
  academic: 'Style: academic writing. Be rigorous and formal, use standard discipline terminology, and keep citations, formulas and variable names unchanged.',
  news: 'Style: news reporting. Be concise and objective, follow the conventions of native-language journalism, and use the established translations of names and places.',
  fiction: 'Style: literary fiction. Preserve tone, voice, rhythm and imagery; make dialogue sound natural; translate idioms by meaning rather than word for word.',
  casual: 'Style: casual social media. Keep it conversational and lively, preserve slang, humour and emoji, and use natural internet expressions.',
};

export function styleRule(style: TranslationStyle | undefined) {
  return style ? STYLE_RULES[style] ?? '' : '';
}

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

export function buildSystemPrompt(s: Pick<Settings, 'targetLang' | 'customPrompt' | 'glossary'> & { translationStyle?: TranslationStyle }): string {
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
  const style = styleRule(s.translationStyle);
  if (style) parts.push('', style);
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
  s: Pick<Settings, 'customPrompt' | 'glossary'> & { translationStyle?: TranslationStyle },
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
  if (mode === 'selection') {
    const style = styleRule(s.translationStyle);
    if (style) parts.push(style);
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

/**
 * 学习模式：长难句解析。像老师讲题一样先讲意思和难点，再拆结构；固定的【小节】格式方便插件渲染。
 * 页面上已有译文时不再让模型重复翻译，直接作为参考给它。
 */
export function buildAnalysisPrompt(targetLang: string, hasTranslation = false, depth: 'standard' | 'detailed' = 'standard'): string {
  const lang = languageName(targetLang);
  const detailed = depth === 'detailed';
  return [
    `You are a patient, experienced language teacher. The learner is a ${lang} speaker reading the passage they send. Explain it in natural, spoken ${lang}, the way a good tutor talks a student through a hard sentence: say what it means and why it is built that way, not just grammar labels.`,
    detailed
      ? 'Cover every sentence in the passage, in order.'
      : 'If the passage has several sentences, give the gist of all of them but only dissect the one or two hardest sentences.',
    'Reply using these sections, each heading on its own line:',
    ...(hasTranslation ? [] : ['【译文】a natural, faithful translation.']),
    `【一句话看懂】1-2 sentences in plain ${lang}: what the passage is really saying and how its ideas connect (contrast, cause, concession…).`,
    '【句子拆解】for each sentence you dissect:',
    '  - first a line starting with "> " that copies the sentence and cuts it into meaning chunks with " | ";',
    '  - then a line "**主干**：…" giving the bare skeleton in original words (e.g. "sentiment has risen …, while it has fallen …");',
    `  - then ${detailed ? 'up to 5' : 'up to 4'} "- " items, each "exact original words：its role and what it attaches to, in a short natural explanation". Skip trivial parts; never write empty lines like "宾语：无".`,
    `【难点提醒】${detailed ? '2-3' : '1-2'} "- " items on what actually trips learners up here (a word used in an unusual sense, an omitted word, a misleading conjunction, inverted order…), and how to read it correctly.`,
    `【重点词汇】${detailed ? '4-6' : '3-5'} of the harder words, each as "- word /IPA/ pos. meaning in this context; a short note on usage if useful".`,
    '【短语搭配】at most 3 "- phrase：meaning" items. Omit the section if there are none.',
    ...(detailed ? ['【仿写】one short new example sentence that reuses the key structure, followed by its translation on the next line.'] : []),
    'Quote original words exactly. Use **bold** only for "主干". No other markdown, no greetings, no closing remarks, and do not repeat the translation.',
    // 示范例子是中文写的，只在目标语言是中文时附上
    ...(targetLang.startsWith('zh') ? ['', analysisExample(hasTranslation, detailed)] : []),
  ].join('\n');
}

/**
 * 示范例子（few-shot）：一份讲得好的完整解析，让模型照着它的深度和语气写——
 * 先讲几句之间的逻辑，再按意群拆句，点出 any 省略、for / while 这些真正卡人的地方。
 * 每次的系统提示词都一样，DeepSeek 等支持前缀缓存的服务商，这部分 token 按缓存价计费。
 */
const EXAMPLE_TEXT =
  "Wealthier Americans have a rosier outlook. Since May 2025, consumer sentiment has risen for people who own the most stocks, while it has fallen for those who don't own any, according to Joanne Hsu, director of the Michigan survey. During that stretch, the broad S&P 500 stock index has handed investors a roughly 32% return.";
const EXAMPLE_TRANSLATION =
  '富裕的美国人对前景更乐观。密歇根大学消费者调查负责人 Joanne Hsu 表示，自 2025 年 5 月以来，持股最多的人群信心上升，而一股都没有的人群信心下降。同一时期，标普 500 指数为投资者带来了约 32% 的回报。';

function analysisExample(hasTranslation: boolean, detailed: boolean): string {
  const lines = [
    '=== Example (for style and depth only; never reuse its content) ===',
    'Passage:',
    hasTranslation ? buildAnalysisInput(EXAMPLE_TEXT, EXAMPLE_TRANSLATION) : EXAMPLE_TEXT,
    '',
    'Reply:',
    ...(hasTranslation ? [] : [`【译文】${EXAMPLE_TRANSLATION}`]),
    '【一句话看懂】有钱人更乐观，是因为股市涨了。三句话是"结论 → 证据 → 原因"：先说富人更乐观，再用持股多和不持股两群人的信心一升一降作证据，最后用标普 500 上涨约 32% 解释原因——股市上涨只让持股的人受益。',
    '【句子拆解】',
    ...(detailed
      ? [
          '> Wealthier Americans | have a rosier outlook.',
          '**主干**：Americans have an outlook',
          '- Wealthier / rosier：两个比较级，比较的对象是不那么富的人；rosy 原意"玫瑰色的"，引申为"乐观的"',
        ]
      : []),
    "> Since May 2025, | consumer sentiment has risen | for people who own the most stocks, | while it has fallen | for those who don't own any, | according to Joanne Hsu, director of the Michigan survey.",
    '**主干**：sentiment has risen for A, while it has fallen for B',
    '- Since May 2025：时间状语，since 要配现在完成时（has risen / has fallen），表示从那时到现在的变化',
    '- for people who own the most stocks：for 是"对……这群人而言"，不是"为了"；who own the most stocks 是定语从句，指持股最多的人',
    '- while it has fallen：while 在这里表对比，意思是"而"；it 指 consumer sentiment',
    "- those who don't own any：those 代替前面的 people，any 后面省略了 stocks，即「一股都没有的人」",
    '- director of the Michigan survey：Joanne Hsu 的同位语，交代她的身份',
    '> During that stretch, | the broad S&P 500 stock index | has handed investors | a roughly 32% return.',
    '**主干**：the index has handed investors a return',
    '- During that stretch：that 回指上一句的"自 2025 年 5 月以来"，把股市上涨和信心分化连在一起',
    '- has handed investors a … return：hand sb sth 双宾语，"把回报递到投资者手里"，比 give 更形象',
    '【难点提醒】',
    '- while 前后一升一降，是对比"而"，不是"当……时"',
    "- don't own any 后面省略了 stocks，读的时候要自动补上",
    ...(detailed ? ['- Since 和 During that stretch 都配现在完成时，三处 has 表示到现在为止的累计变化'] : []),
    '【重点词汇】',
    '- rosy /ˈroʊzi/ adj. 乐观的；rosier 是比较级，rosy outlook 指乐观的预期',
    '- sentiment /ˈsentɪmənt/ n. 情绪、信心；consumer sentiment 是经济术语"消费者信心"',
    '- stretch /stretʃ/ n. 一段连续的时间，不是"伸展"',
    '- broad /brɔːd/ adj. 覆盖面广的；broad index 指覆盖整个大盘的宽基指数',
    '【短语搭配】',
    '- rosy outlook：乐观的前景',
    '- hand sb a return：给某人带来回报',
    '- according to sb：据某人所说',
    ...(detailed
      ? [
          '【仿写】',
          'Since the pandemic, remote work has grown for tech workers, while it has shrunk for those in retail.',
          '疫情以来，科技行业的远程办公增多了，而零售业的却减少了。',
        ]
      : []),
    '=== End of example ===',
  ];
  return lines.join('\n');
}

export function buildAnalysisInput(text: string, translation?: string) {
  return translation ? `${text}\n\n(Reference translation, do not repeat it: ${translation})` : text;
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
