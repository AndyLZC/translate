import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, ExternalLink, GraduationCap, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/toggle-group';
import { PROVIDERS, providerConfigError } from '@/lib/providers';
import { listNotes, notesToCsv, removeNote, watchNotes, type NoteEntry } from '@/lib/notebook';
import { Group, PageHeader, Row, type SectionProps } from '../layout';
import { Review } from './review';
import { download } from '../util';

export function LearningSection({ settings, update }: SectionProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'word' | 'sentence'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void listNotes().then(setNotes);
    return watchNotes(setNotes);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => (filter === 'all' || n.type === filter) && (!q || n.text.toLowerCase().includes(q) || n.meaning.toLowerCase().includes(q)));
  }, [notes, filter, query]);

  const words = notes.filter((n) => n.type === 'word').length;

  return (
    <>
      <PageHeader icon={<GraduationCap />} title="学习" description="边读边学：译文后点「解析」查看句子结构、重点词汇和语法，还能追问 AI；划词查单词；收藏到生词本，导出到 Anki 复习。" />
      <div className="space-y-8">
        <Group>
          <Row label="学习模式" description="在译文末尾显示「解析」，点 YouTube 字幕也能暂停并解析这一句。">
            <Switch checked={settings.learningMode} onCheckedChange={(v) => update({ learningMode: v })} />
          </Row>
          <Row label="「解析」入口" description="悬停显示：鼠标移到段落上才出现，页面更清爽（手机上淡色常显）；始终显示：每段译文前都显示。日期、栏目名、太短的标题不显示。">
            <SegmentedControl
              className="sm:w-56"
              value={settings.learnTrigger}
              onValueChange={(v) => update({ learnTrigger: v })}
              options={[
                { value: 'hover', label: '悬停显示' },
                { value: 'always', label: '始终显示' },
              ]}
            />
          </Row>
          <Row label="解析详细程度" description="标准：讲大意和难点，只拆最难的一两句，速度快；详细：逐句拆解，多讲几个词，再给一个仿写例句。">
            <SegmentedControl
              className="sm:w-48"
              value={settings.analysisDepth}
              onValueChange={(v) => update({ analysisDepth: v })}
              options={[
                { value: 'standard', label: '标准' },
                { value: 'detailed', label: '详细' },
              ]}
            />
          </Row>
          <Row label="解析使用的模型" description="翻译用便宜快速的模型，解析和追问可以单独换成更强的模型（如 Claude、GPT），讲解更自然。只能选已配置好的服务商。">
            <Select value={settings.analysisProvider === settings.activeProvider ? 'same' : settings.analysisProvider} onValueChange={(v) => update({ analysisProvider: v as typeof settings.analysisProvider })}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">和翻译相同</SelectItem>
                {PROVIDERS.filter((p) => p.type !== settings.activeProvider).map((p) => {
                  const err = providerConfigError(p.type, settings.providers[p.type]);
                  return (
                    <SelectItem key={p.type} value={p.type} disabled={!!err}>
                      {p.label}（{err ? '未配置' : settings.providers[p.type].model}）
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Row>
          <Row label="生词高亮" description="生词本里的单词出现在任何网页上时自动标出（包括复数、过去式等变形），鼠标停在上面显示释义。">
            <Switch checked={settings.vocabHighlight} onCheckedChange={(v) => update({ vocabHighlight: v })} />
          </Row>
        </Group>

        <Review notes={notes} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4" />
                生词本
              </h2>
              <p className="text-xs text-muted-foreground">
                共 {notes.length} 条：单词 {words}，句子 {notes.length - words}。划词卡片和解析面板里点 ♥ 收藏。
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={!notes.length} onClick={() => download(`生词本-${new Date().toISOString().slice(0, 10)}.csv`, notesToCsv(notes), 'text/csv')}>
              <Download />
              导出 CSV
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <SegmentedControl
              className="sm:w-60"
              size="sm"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: 'all', label: '全部' },
                { value: 'word', label: '单词' },
                { value: 'sentence', label: '句子' },
              ]}
            />
            <div className="relative flex-1">
              <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input className="h-8 pl-8" placeholder="搜索原文或释义" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {shown.length ? (
            <div className="grid gap-2">
              {shown.slice(0, 200).map((n) => (
                <Card key={n.id} className="gap-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={n.type === 'word' ? 'accent' : 'secondary'}>{n.type === 'word' ? '单词' : '句子'}</Badge>
                        <span className={n.type === 'word' ? 'font-semibold' : 'text-sm font-medium'}>{n.text}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.meaning}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="删除" onClick={() => removeNote(n.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                  <a href={n.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary">
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{n.title || n.url}</span>
                    <span className="shrink-0">· {new Date(n.createdAt).toLocaleDateString()}</span>
                  </a>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="items-center py-10 text-center text-sm text-muted-foreground">
              <BookOpen className="size-8 opacity-40" />
              {notes.length ? '没有匹配的条目' : '还没有收藏。划词查单词或打开「解析」后，点 ♥ 收藏到这里。'}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
