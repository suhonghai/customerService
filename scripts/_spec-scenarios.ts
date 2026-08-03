#!/usr/bin/env tsx
/**
 * _spec-scenarios — spec 文件的 scenario(it/test 标题)提取器
 *
 * 为什么单独抽一个文件:
 *   scripts/spec-audit.ts 和 scripts/spec-status.ts 原本各写各的正则,
 *   结果两边都漏了 `it.each(...)(...)` 参数化用例(cs-round-006 被报成 0 scenarios,
 *   还因此被 spec-audit 的 `scenarios.length === 0 → continue` 完全跳出漂移检测)。
 *   共享一份提取逻辑,两个脚本就不会再各自漂移 —— 这正是 2026-08-03 审计 #8 的根因。
 *
 * 覆盖的写法:
 *   it('...')             test('...')
 *   it.only / it.skip / it.todo / it.concurrent / it.failing(及 test.* 同名变体)
 *   it.each([...])('...')  test.each`...`('...')
 * 两个易错点(都踩过):
 *   1. 必须有 \b 词边界 —— 否则 `split('\n')` 里的 "it(" 会被当成用例(order.e2e-spec 曾多算 1 条)
 *   2. 标题内允许出现**其它类型**的引号 —— `it('用户问"如何退款"')` 是合法写法,
 *      收尾必须用反向引用配 (?!\1) 逐字放行,不能简单写成 [^'"`]+
 */

/** 引号包裹的标题:开头引号用捕获组,内容允许含其它引号,收尾必须是同一种引号 */
const TITLE = String.raw`(['"\`])((?:(?!\1)[^\n])+)\1`;

/** 普通用例:it('title') / test.only('title') / ... */
const PLAIN_RE = new RegExp(
  String.raw`\b(?:it|test)(?:\.(?:only|skip|todo|concurrent|failing))*\s*\(\s*` + TITLE,
  'g',
);

/** 参数化用例:it.each([...])('title %s') / test.each`table`('title') */
const EACH_RE = new RegExp(
  String.raw`\b(?:it|test)\.each\s*(?:\([\s\S]*?\)|\`[\s\S]*?\`)\s*\(\s*` + TITLE,
  'g',
);

/**
 * 从 spec 文件内容里抽出所有 scenario 标题。
 *
 * 不去重:同名 it() 是各自独立的用例,去重会让 scenario 计数偏小 ——
 * 而"计数偏小"正是本文件要修的那类 bug,不能在修的过程中再引入一次。
 */
export function extractScenarios(content: string): string[] {
  const out: string[] = [];
  for (const re of [PLAIN_RE, EACH_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const title = m[2].trim();
      if (title) out.push(title);
    }
  }
  return out;
}
