import { describe, expect, it } from 'vitest';
import { currentVideoId, findSentenceIndex, parseTimedText, segment, trackInfo } from '@/youtube/subtitles';

const manualJson3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello everyone, and welcome' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'to the channel.' }] },
    { tStartMs: 4000, dDurationMs: 100, aAppend: 1, segs: [{ utf8: '\n' }] },
    { tStartMs: 4200, dDurationMs: 2500, segs: [{ utf8: 'Today we talk\nabout cats.' }] },
    { tStartMs: 12000, dDurationMs: 2000, segs: [{ utf8: '[Music]' }] },
  ],
});

const asrJson3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 9000, wWinId: 1 },
    {
      tStartMs: 500,
      dDurationMs: 3000,
      segs: [{ utf8: 'so' }, { utf8: ' today', tOffsetMs: 300 }, { utf8: ' we', tOffsetMs: 600 }, { utf8: ' build', tOffsetMs: 900 }],
    },
    { tStartMs: 1600, dDurationMs: 50, aAppend: 1, segs: [{ utf8: '\n' }] },
    {
      tStartMs: 1700,
      dDurationMs: 1000,
      segs: [{ utf8: 'a' }, { utf8: ' robot', tOffsetMs: 200 }],
    },
    {
      tStartMs: 4000,
      dDurationMs: 1500,
      segs: [{ utf8: 'it' }, { utf8: ' is', tOffsetMs: 200 }, { utf8: ' fun', tOffsetMs: 400 }],
    },
  ],
});

describe('parseTimedText + segment', () => {
  it('人工字幕：跨行合并成完整句子，按句末标点断开', () => {
    const track = parseTimedText(manualJson3, 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3');
    expect(track.asr).toBe(false);
    const s = segment(track);
    expect(s.map((x) => x.text)).toEqual(['Hello everyone, and welcome to the channel.', 'Today we talk about cats.', '[Music]']);
    expect(s[0].start).toBe(0);
    // 短空档内延续显示到下一句开始
    expect(s[0].end).toBe(4200);
    // 长空档不延续
    expect(s[1].end).toBe(6700);
  });

  it('自动字幕：逐词拼接，按停顿断句', () => {
    const track = parseTimedText(asrJson3, 'https://www.youtube.com/api/timedtext?v=abc&kind=asr&lang=en');
    expect(track.asr).toBe(true);
    const s = segment(track);
    expect(s.map((x) => x.text)).toEqual(['so today we build a robot', 'it is fun']);
    expect(s[0].start).toBe(500);
    expect(s[1].start).toBe(4000);
  });

  it('自动字幕超长时强制断句', () => {
    const words = Array.from({ length: 60 }, (_, i) => ({ utf8: (i ? ' ' : '') + 'word', tOffsetMs: i * 300 }));
    const s = segment(parseTimedText(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 20000, segs: words }] }), '&kind=asr'));
    expect(s.length).toBeGreaterThan(2);
    expect(s.every((x) => x.text.length <= 140)).toBe(true);
  });

  it('XML 格式', () => {
    const xml = '<?xml version="1.0"?><transcript><text start="1.5" dur="2">It&amp;#39;s a test.</text><text start="4" dur="1">Bye.</text></transcript>';
    const s = segment(parseTimedText(xml));
    expect(s.map((x) => x.text)).toEqual(["It's a test.", 'Bye.']);
    expect(s[0].start).toBe(1500);
  });

  it('二分查找当前句子', () => {
    const s = segment(parseTimedText(manualJson3));
    expect(findSentenceIndex(s, 100)).toBe(0);
    expect(findSentenceIndex(s, 4100)).toBe(0);
    expect(findSentenceIndex(s, 5000)).toBe(1);
    expect(findSentenceIndex(s, 9000)).toBe(-1);
    expect(findSentenceIndex(s, 13000)).toBe(2);
  });
});

describe('trackInfo / currentVideoId', () => {
  it('解析字幕地址', () => {
    expect(trackInfo('/api/timedtext?v=abc123&lang=en&kind=asr&fmt=json3&tlang=zh-Hans')).toEqual({
      videoId: 'abc123',
      lang: 'en',
      tlang: 'zh-Hans',
      asr: true,
    });
  });
  it('当前视频 id', () => {
    expect(currentVideoId({ href: 'https://www.youtube.com/watch?v=xyz789&t=10' } as Location)).toBe('xyz789');
    expect(currentVideoId({ href: 'https://www.youtube.com/embed/abcdef1' } as Location)).toBe('abcdef1');
    expect(currentVideoId({ href: 'https://www.youtube.com/' } as Location)).toBe('');
  });
});

describe('toSrt', async () => {
  const { toSrt } = await import('@/youtube/subtitles');
  it('双语 SRT 格式', () => {
    const srt = toSrt([
      { start: 0, end: 2500, text: 'Hello.', translation: '你好。' },
      { start: 3_723_004, end: 3_725_000, text: 'Bye.' },
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:02,500\nHello.\n你好。\n\n2\n01:02:03,004 --> 01:02:05,000\nBye.\n');
  });
});
