import { useEffect, useMemo, useState } from 'react';
import { Brain, PartyPopper, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { gradeNote, isDue, type NoteEntry } from '@/lib/notebook';

/** 单词卡片复习：先看原文回想，再翻面看释义，按记得程度安排下次复习 */
export function Review({ notes }: { notes: NoteEntry[] }) {
  const due = useMemo(() => notes.filter((n) => isDue(n)), [notes]);
  const [queue, setQueue] = useState<NoteEntry[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const card = queue?.[0];

  const grade = async (g: 'again' | 'hard' | 'good') => {
    if (!card) return;
    await gradeNote(card.id, g);
    setRevealed(false);
    setDone((d) => d + 1);
    // 忘了的放到队尾，本轮再出现一次
    setQueue((q) => (q ? [...q.slice(1), ...(g === 'again' ? [q[0]] : [])] : q));
  };

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        void grade((['again', 'hard', 'good'] as const)[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!queue) {
    return (
      <Card className="flex-row items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Brain className="size-5" />
          </div>
          <div>
            <div className="font-semibold">卡片复习</div>
            <div className="text-xs text-muted-foreground">{due.length ? `${due.length} 条待复习，按记忆曲线安排，越熟悉间隔越长` : '今天没有需要复习的，收藏新词后再来'}</div>
          </div>
        </div>
        <Button disabled={!due.length} onClick={() => (setQueue(due.slice(0, 50)), setDone(0), setRevealed(false))}>
          开始复习
        </Button>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card className="items-center gap-2 py-10 text-center">
        <PartyPopper className="size-8 text-primary" />
        <div className="font-semibold">复习完成，共 {done} 次</div>
        <Button variant="outline" size="sm" onClick={() => setQueue(null)}>
          返回
        </Button>
      </Card>
    );
  }

  return (
    <Card className="gap-4 px-6 py-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>剩余 {queue.length}</span>
        <button className="cursor-pointer hover:text-foreground" onClick={() => setQueue(null)}>
          结束
        </button>
      </div>
      <div className="flex items-start justify-center gap-2 text-center">
        <div className={card.type === 'word' ? 'text-3xl font-semibold tracking-tight' : 'text-lg leading-relaxed font-medium'}>{card.text}</div>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="朗读" onClick={() => speak(card.text)}>
          <Volume2 />
        </Button>
      </div>
      {revealed ? (
        <>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{card.meaning || '（没有释义）'}</div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="border-destructive/40 text-destructive hover:text-destructive" onClick={() => grade('again')}>
              忘了 <kbd className="text-[10px] opacity-60">1</kbd>
            </Button>
            <Button variant="outline" onClick={() => grade('hard')}>
              有点难 <kbd className="text-[10px] opacity-60">2</kbd>
            </Button>
            <Button onClick={() => grade('good')}>
              记得 <kbd className="text-[10px] opacity-70">3</kbd>
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" size="lg" onClick={() => setRevealed(true)}>
          显示释义 <kbd className="text-[10px] opacity-60">空格</kbd>
        </Button>
      )}
    </Card>
  );
}

function speak(text: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[A-Za-z]/.test(text) ? 'en-US' : 'zh-CN';
  speechSynthesis.speak(u);
}
