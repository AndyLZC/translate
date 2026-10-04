/**
 * 站点规则：每个网站的特殊处理写成配置，出问题只改这里（或在设置页覆盖），不动核心代码。
 *
 * - matches: 主机名，匹配自身及子域名（"github.com" 也匹配 "gist.github.com"）
 * - blocks:  强制把匹配到的元素整体当作一个段落（适合内部结构零碎的推文、评论等）
 * - exclude: 匹配到的元素及其子孙一律不翻译
 * - roots:   只在这些容器内查找段落；不写则扫描整个页面
 */
export interface SiteRule {
  name: string;
  matches: string[];
  blocks?: string[];
  exclude?: string[];
  roots?: string[];
}

export const BUILTIN_SITE_RULES: SiteRule[] = [
  {
    name: 'x',
    matches: ['x.com', 'twitter.com'],
    blocks: ['[data-testid="tweetText"]'],
    exclude: [
      '[data-testid="User-Name"]',
      '[data-testid="UserName"]',
      '[role="group"]',
      '[data-testid="trend"]',
      'nav',
      'time',
    ],
  },
  {
    name: 'github',
    matches: ['github.com'],
    exclude: [
      '.blob-code',
      '.react-code-lines',
      '.react-file-line',
      'table.diff-table',
      '.diff-table',
      '.AppHeader',
      'header',
      '.file-navigation',
      '.commit-tease',
      'relative-time',
      '.Counter',
      '.Label',
      '.IssueLabel',
      '.author',
      '.react-directory-filename-column',
    ],
  },
  {
    name: 'reddit',
    matches: ['reddit.com'],
    blocks: ['shreddit-post a[slot="title"]', '[slot="text-body"] p', '[slot="comment"] p'],
    exclude: ['faceplate-timeago', 'shreddit-post-flair', 'reddit-header-large', 'nav'],
  },
  {
    name: 'hacker-news',
    matches: ['news.ycombinator.com'],
    blocks: ['.titleline > a'],
    exclude: ['.subline', '.subtext', '.comhead', '.pagetop', '.sitebit', '.navs', '.reply'],
  },
  {
    name: 'wikipedia',
    matches: ['wikipedia.org'],
    exclude: [
      '.mw-editsection',
      'sup.reference',
      '.reference',
      '.mw-cite-backlink',
      '.navbox',
      '.vector-header',
      '.vector-menu',
      '#p-lang-btn',
      '.mw-jump-link',
      '.catlinks',
    ],
  },
  {
    name: 'stackoverflow',
    matches: ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com'],
    exclude: ['.s-topbar', '.post-tag', '.user-info', '.js-vote-count', '.relativetime', '#left-sidebar'],
  },
  {
    name: 'youtube',
    matches: ['youtube.com'],
    blocks: ['#content-text', 'yt-formatted-string#video-title', '#title > h1 yt-formatted-string'],
    exclude: ['#masthead-container', '#guide', '.ytp-chrome-bottom', '#channel-name', '#metadata-line'],
  },
];

/** 所有站点通用：这些元素不翻译 */
export const GLOBAL_EXCLUDE = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'canvas',
  'svg',
  'math',
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'textarea',
  'input',
  'select',
  'option',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[translate="no"]',
  '.notranslate',
  '.katex',
  '.MathJax',
].join(',');

export function hostMatches(host: string, pattern: string) {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().replace(/^\*\./, '');
  return h === p || h.endsWith('.' + p);
}

export function parseCustomRules(json: string): SiteRule[] {
  if (!json.trim()) return [];
  const data = JSON.parse(json);
  const list = Array.isArray(data) ? data : [data];
  return list.map((r, i) => {
    if (!r || !Array.isArray(r.matches)) throw new Error(`第 ${i + 1} 条规则缺少 matches 数组`);
    return { name: r.name ?? `custom-${i + 1}`, ...r } as SiteRule;
  });
}

/** 合并当前主机命中的所有规则；自定义规则与内置规则同名时覆盖内置 */
export function resolveSiteRule(host: string, customJson = ''): Required<Omit<SiteRule, 'name' | 'matches'>> {
  let custom: SiteRule[] = [];
  try {
    custom = parseCustomRules(customJson);
  } catch (e) {
    console.warn('[ai-translate] 自定义站点规则解析失败', e);
  }
  const overridden = new Set(custom.map((r) => r.name));
  const rules = [...BUILTIN_SITE_RULES.filter((r) => !overridden.has(r.name)), ...custom].filter((r) =>
    r.matches.some((m) => hostMatches(host, m)),
  );
  return {
    blocks: rules.flatMap((r) => r.blocks ?? []),
    exclude: rules.flatMap((r) => r.exclude ?? []),
    roots: rules.flatMap((r) => r.roots ?? []),
  };
}
