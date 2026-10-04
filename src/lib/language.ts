import { franc } from 'franc-min';

const HAN = /\p{Script=Han}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const LETTER = /\p{L}/gu;

/** 目标语言代码 → franc 返回的 ISO 639-3 代码 */
const FRANC_CODES: Record<string, string> = {
  en: 'eng',
  fr: 'fra',
  de: 'deu',
  es: 'spa',
  ru: 'rus',
  ja: 'jpn',
  ko: 'kor',
};

/** 有没有值得翻译的文字（至少一个字母类字符，排除纯数字、符号、表情） */
export function hasTranslatableText(text: string) {
  const t = text.trim();
  const letters = t.match(LETTER);
  if (!letters || t.length < 2) return false;
  // 单独的文件名、网址、@用户名、snake_case 标识符之类不用翻译
  if (!/\s/.test(t) && /[./@_\\:]/.test(t) && /^[\p{L}\p{N}._\-/@:\\?=&%#~+]+$/u.test(t)) return false;
  return true;
}

/** 判断一段文字是否已经是目标语言；是则跳过，省 token */
export function isTargetLanguage(text: string, target: string): boolean {
  const letters = text.match(LETTER)?.length ?? 0;
  if (!letters) return true;

  if (target.startsWith('zh')) {
    if (KANA.test(text) || HANGUL.test(text)) return false;
    const han = text.match(HAN)?.length ?? 0;
    return han / letters >= 0.4;
  }
  if (target === 'ja') return KANA.test(text);
  if (target === 'ko') return HANGUL.test(text);

  const code = FRANC_CODES[target];
  if (!code) return false;
  // 短文本 franc 不可靠，直接不跳过（宁可多翻）
  if (text.length < 40) return false;
  return franc(text, { minLength: 20 }) === code;
}
