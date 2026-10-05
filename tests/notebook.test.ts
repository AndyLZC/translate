import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addNote, hasNote, listNotes, notesToCsv, removeNote } from '@/lib/notebook';

describe('notebook', () => {
  beforeEach(() => fakeBrowser.reset());
  const base = { url: 'https://a.com', title: 'A' };

  it('添加、去重（移到最前）、删除', async () => {
    await addNote({ ...base, type: 'word', text: 'soil', meaning: 'n. 土壤' });
    await addNote({ ...base, type: 'sentence', text: 'Soil matters.', meaning: '土壤很重要。' });
    await addNote({ ...base, type: 'word', text: 'soil', meaning: 'n. 土壤；泥土' });
    const notes = await listNotes();
    expect(notes.map((n) => n.text)).toEqual(['soil', 'Soil matters.']);
    expect(notes[0].meaning).toBe('n. 土壤；泥土');
    expect(await hasNote('word', 'soil')).toBe(true);
    await removeNote(notes[0].id);
    expect(await hasNote('word', 'soil')).toBe(false);
  });

  it('导出 CSV：转义引号、带 BOM', () => {
    const csv = notesToCsv([{ ...base, id: '1', type: 'word', text: 'say "hi"', meaning: '打招呼,问好', createdAt: 0 }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"say ""hi""","打招呼,问好"');
  });
});
