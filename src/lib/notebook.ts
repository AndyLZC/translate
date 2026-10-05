import { browser } from 'wxt/browser';

/** 生词本：划词查到的单词、学习模式解析过的句子 */
export interface NoteEntry {
  id: string;
  type: 'word' | 'sentence';
  text: string;
  /** 释义或译文 */
  meaning: string;
  /** 句子的解析全文 */
  analysis?: string;
  url: string;
  title: string;
  createdAt: number;
  /** 复习：所在的盒子（0 = 新词）和下次复习时间 */
  box?: number;
  due?: number;
}

/** 间隔复习（Leitner）：答对进下一个盒子，间隔变长；答错回到第一个 */
export const REVIEW_INTERVALS_DAYS = [0, 1, 2, 4, 7, 15, 30];
const DAY = 86_400_000;

export function isDue(n: NoteEntry, now = Date.now()) {
  return (n.due ?? 0) <= now;
}

export function nextReview(n: NoteEntry, grade: 'again' | 'hard' | 'good', now = Date.now()): Pick<NoteEntry, 'box' | 'due'> {
  const box = n.box ?? 0;
  const next = grade === 'again' ? 0 : grade === 'hard' ? Math.max(1, box) : Math.min(box + 1, REVIEW_INTERVALS_DAYS.length - 1);
  // 答错 10 分钟后再出现；其余按盒子对应的天数
  const due = grade === 'again' ? now + 10 * 60_000 : now + REVIEW_INTERVALS_DAYS[next] * DAY;
  return { box: next, due };
}

export async function gradeNote(id: string, grade: 'again' | 'hard' | 'good') {
  const notes = await listNotes();
  await browser.storage.local.set({ [KEY]: notes.map((n) => (n.id === id ? { ...n, ...nextReview(n, grade) } : n)) });
}

const KEY = 'notebook';
const MAX = 3000;

export async function listNotes(): Promise<NoteEntry[]> {
  return ((await browser.storage.local.get(KEY))[KEY] as NoteEntry[] | undefined) ?? [];
}

/** 同一条文字只保留一份（更新释义并移到最前） */
export async function addNote(entry: Omit<NoteEntry, 'id' | 'createdAt'>): Promise<NoteEntry> {
  const notes = await listNotes();
  const note: NoteEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const rest = notes.filter((n) => !(n.type === entry.type && n.text === entry.text));
  await browser.storage.local.set({ [KEY]: [note, ...rest].slice(0, MAX) });
  return note;
}

export async function hasNote(type: NoteEntry['type'], text: string) {
  return (await listNotes()).some((n) => n.type === type && n.text === text);
}

export async function removeNote(id: string) {
  await browser.storage.local.set({ [KEY]: (await listNotes()).filter((n) => n.id !== id) });
}

export async function removeNoteByText(type: NoteEntry['type'], text: string) {
  await browser.storage.local.set({ [KEY]: (await listNotes()).filter((n) => !(n.type === type && n.text === text)) });
}

export function watchNotes(cb: (notes: NoteEntry[]) => void) {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb((changes[KEY].newValue as NoteEntry[] | undefined) ?? []);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** 导出 CSV（Excel / Anki 可直接导入）：正面=原文，背面=释义 */
export function notesToCsv(notes: NoteEntry[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [['类型', '原文', '释义', '来源', '网址', '时间']];
  for (const n of notes) {
    rows.push([
      n.type === 'word' ? '单词' : '句子',
      n.text,
      n.meaning,
      n.title,
      n.url,
      new Date(n.createdAt).toLocaleString(),
    ]);
  }
  // 带 BOM，Excel 打开不乱码
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
