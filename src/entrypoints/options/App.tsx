import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui';
import { sendMessage } from '@/lib/messaging';
import { TARGET_LANGUAGES, type DisplayMode, type Settings, type TranslationTheme } from '@/lib/settings';
import { BUILTIN_SITE_RULES, parseCustomRules } from '@/lib/site-rules';
import { useSettings } from '@/lib/use-settings';

const MODEL_SUGGESTIONS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4.1', 'gpt-5-mini', 'gpt-5-nano'];

const THEMES: { value: TranslationTheme; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'underline', label: '虚线' },
  { value: 'dim', label: '淡色' },
  { value: 'highlight', label: '高亮' },
  { value: 'italic', label: '斜体' },
];

const MODES: { value: DisplayMode; label: string }[] = [
  { value: 'bilingual', label: '双语对照' },
  { value: 'translation', label: '只看译文' },
  { value: 'original', label: '只看原文' },
];

export default function App() {
  const [settings, update] = useSettings();
  if (!settings) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-muted)]">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <header className="flex items-center gap-3">
          <img src="/icon/128.png" className="h-10 w-10" alt="" />
          <div>
            <h1 className="text-xl font-semibold">AI 双语翻译 · 设置</h1>
            <p className="text-sm text-[var(--fg-muted)]">修改后自动保存，已打开的页面立即生效。</p>
          </div>
        </header>
        <ModelSection settings={settings} update={update} />
        <TranslateSection settings={settings} update={update} />
        <PerformanceSection settings={settings} update={update} />
        <SitesSection settings={settings} update={update} />
        <CacheSection />
      </div>
    </div>
  );
}

interface SectionProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

/** 文本框失焦时才保存，避免每敲一个字都触发所有页面重新翻译 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}

function ModelSection({ settings, update }: SectionProps) {
  const [apiKey, setApiKey] = useDraft(settings.apiKey);
  const [baseURL, setBaseURL] = useDraft(settings.baseURL);
  const [model, setModel] = useDraft(settings.model);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await sendMessage('testConnection', { apiKey, baseURL, model }));
    } catch (e) {
      setTest({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card title="模型服务" description="使用 OpenAI 官方接口，或任何 OpenAI 兼容接口（DeepSeek、OpenRouter、本地 Ollama 等，改接口地址即可）。">
      <Field label="API Key" hint="只保存在本机浏览器里，只会发送给下面的接口地址。">
        <div className="flex gap-2">
          <Input
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={apiKey}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => update({ apiKey: apiKey.trim() })}
          />
          <Button variant="secondary" type="button" onClick={() => setShowKey(!showKey)}>
            {showKey ? '隐藏' : '显示'}
          </Button>
        </div>
      </Field>
      <Field label="接口地址" hint="留空为 https://api.openai.com/v1；本地 Ollama 填 http://localhost:11434/v1">
        <Input
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          onBlur={() => update({ baseURL: baseURL.trim() })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="模型" hint="可直接输入任意模型名">
          <Input list="model-suggestions" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => update({ model: model.trim() })} />
          <datalist id="model-suggestions">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label={`温度：${settings.temperature}`} hint="越低越稳定，翻译建议 0～0.3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.temperature}
            onChange={(e) => update({ temperature: Number(e.target.value) })}
            className="w-full accent-[var(--color-brand)]"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runTest} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </Button>
        {test && <span className={test.ok ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>{test.message}</span>}
      </div>
    </Card>
  );
}

function TranslateSection({ settings, update }: SectionProps) {
  const [prompt, setPrompt] = useDraft(settings.customPrompt);
  const [glossary, setGlossary] = useDraft(settings.glossary);
  return (
    <Card title="翻译">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="目标语言">
          <Select value={settings.targetLang} onChange={(e) => update({ targetLang: e.target.value })}>
            {TARGET_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="显示方式" hint="「只看译文」只对整段生效，段落中夹杂的零散文字仍双语显示">
          <Segmented value={settings.displayMode} options={MODES} onChange={(v) => update({ displayMode: v })} />
        </Field>
      </div>
      <Field label="译文样式">
        <Segmented value={settings.theme} options={THEMES} onChange={(v) => update({ theme: v })} />
      </Field>
      <Field label="术语表" hint="每行一条，格式：原文=译文。以 # 开头的行会被忽略。">
        <Textarea rows={4} placeholder={'Agent=智能体\nprompt=提示词'} value={glossary} onChange={(e) => setGlossary(e.target.value)} onBlur={() => update({ glossary })} />
      </Field>
      <Field label="额外要求" hint="会追加到系统提示词末尾，例如翻译风格、专业领域。">
        <Textarea rows={3} placeholder="例如：这是技术文档，术语保留英文并在首次出现时用括号注明中文。" value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => update({ customPrompt: prompt })} />
      </Field>
    </Card>
  );
}

function NumberField({ label, hint, value, min, max, onCommit }: { label: string; hint?: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useDraft(String(value));
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.min(max, Math.max(min, Math.round(Number(draft) || min)));
          setDraft(String(n));
          onCommit(n);
        }}
      />
    </Field>
  );
}

function PerformanceSection({ settings, update }: SectionProps) {
  return (
    <Card title="速度与费用" description="多个段落合并成一个请求翻译，比一段一个请求省 token；遇到 429 可以调低并发或设置每分钟上限。">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="并发请求数" value={settings.concurrency} min={1} max={20} onCommit={(v) => update({ concurrency: v })} />
        <NumberField label="每分钟请求上限" hint="0 表示不限制" value={settings.requestsPerMinute} min={0} max={10000} onCommit={(v) => update({ requestsPerMinute: v })} />
        <NumberField label="每个请求的段落数" value={settings.batchSize} min={1} max={50} onCommit={(v) => update({ batchSize: v })} />
        <NumberField label="每个请求的字符上限" value={settings.batchChars} min={200} max={20000} onCommit={(v) => update({ batchChars: v })} />
      </div>
    </Card>
  );
}

function SitesSection({ settings, update }: SectionProps) {
  const [always, setAlways] = useDraft(settings.alwaysTranslateSites.join('\n'));
  const [never, setNever] = useDraft(settings.neverTranslateSites.join('\n'));
  const [rules, setRules] = useDraft(settings.customSiteRules);
  const [ruleError, setRuleError] = useState('');
  const toList = (s: string) => [...new Set(s.split(/[\n,\s]+/).map((x) => x.trim()).filter(Boolean))];

  const saveRules = () => {
    try {
      parseCustomRules(rules);
      setRuleError('');
      void update({ customSiteRules: rules });
    } catch (e) {
      setRuleError(`没有保存：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Card title="网站">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">显示悬浮按钮</span>
        <Switch checked={settings.showFloatingButton} onChange={(v) => update({ showFloatingButton: v })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="总是翻译的网站" hint="每行一个域名，包含子域名">
          <Textarea rows={4} placeholder="news.ycombinator.com" value={always} onChange={(e) => setAlways(e.target.value)} onBlur={() => update({ alwaysTranslateSites: toList(always) })} />
        </Field>
        <Field label="隐藏悬浮按钮的网站" hint="快捷键和弹窗仍可翻译">
          <Textarea rows={4} placeholder="mail.google.com" value={never} onChange={(e) => setNever(e.target.value)} onBlur={() => update({ neverTranslateSites: toList(never) })} />
        </Field>
      </div>
      <Field
        label="自定义站点规则（JSON）"
        hint={
          <>
            与内置规则同名（name）时覆盖内置规则。字段：matches 域名数组、blocks 强制整段翻译的选择器、exclude 不翻译的选择器、roots 只翻译这些容器。
            内置规则：{BUILTIN_SITE_RULES.map((r) => r.name).join('、')}。
          </>
        }
      >
        <Textarea
          rows={7}
          placeholder={JSON.stringify([{ name: 'example', matches: ['example.com'], blocks: ['.post-title'], exclude: ['.sidebar', '.author'] }], null, 2)}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          onBlur={saveRules}
        />
      </Field>
      {ruleError && <p className="text-sm text-red-600">{ruleError}</p>}
    </Card>
  );
}

function CacheSection() {
  const [count, setCount] = useState<number | null>(null);
  const refresh = () => sendMessage('cacheStats').then((r) => setCount(r.count)).catch(() => setCount(null));
  useEffect(() => void refresh(), []);
  return (
    <Card title="缓存" description="翻译结果按 原文 + 模型 + 目标语言 + 提示词 缓存在本地，重复访问的页面不再花费 token。">
      <div className="flex items-center gap-3">
        <span className="text-sm">已缓存 {count ?? '—'} 段</span>
        <Button
          variant="danger"
          onClick={async () => {
            await sendMessage('clearCache');
            void refresh();
          }}
        >
          清空缓存
        </Button>
      </div>
    </Card>
  );
}
