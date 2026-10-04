import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, parseGlossary, parseSegments } from '@/background/prompt';

describe('prompt', () => {
  it('按编号打包段落', () => {
    expect(buildUserPrompt(['a', 'b'], { title: 'T' })).toBe(
      'Page title (for context only, do not translate): T\n\n<seg id="1">a</seg>\n<seg id="2">b</seg>',
    );
  });

  it('系统提示词包含目标语言、术语表和自定义要求', () => {
    const s = buildSystemPrompt({ targetLang: 'zh-CN', glossary: 'Agent=智能体\n# 注释\nbad line', customPrompt: '口语化' });
    expect(s).toContain('Simplified Chinese');
    expect(s).toContain('- Agent → 智能体');
    expect(s).not.toContain('bad line');
    expect(s).toContain('口语化');
  });

  it('解析术语表', () => {
    expect(parseGlossary('A=甲\nB → 乙\n=空\n')).toEqual([
      ['A', '甲'],
      ['B', '乙'],
    ]);
  });

  it('按编号解析模型输出，容忍缺少闭合标签、多余文字和乱序', () => {
    const out = 'Sure!\n<seg id="2">乙</seg>\n<seg id=1>甲</seg>\n<seg id="3">丙';
    const m = parseSegments(out, 3);
    expect([m.get(1), m.get(2), m.get(3)]).toEqual(['甲', '乙', '丙']);
  });

  it('缺失的编号不出现在结果里；单段时接受不带包裹的输出', () => {
    expect(parseSegments('<seg id="1">甲</seg>', 2).has(2)).toBe(false);
    expect(parseSegments('甲', 1).get(1)).toBe('甲');
  });
});
