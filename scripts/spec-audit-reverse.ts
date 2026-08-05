#!/usr/bin/env tsx
/**
 * spec-audit-reverse — 反向追溯(改了 src/ 哪个 export → 哪个 spec 没跟着)
 *
 * 跟 spec-audit.ts 互为反向:
 *   spec-audit.ts:        spec → 0 代码命中(spec 提到关键词,代码里没有 → spec 漂移)
 *   spec-audit-reverse.ts: code → 0 spec 引用(代码导出 export,spec 里没提 → 覆盖洞)
 *
 * 跑法:
 *   pnpm spec:audit:reverse           # 默认扫 main..HEAD 改动文件的 export
 *   pnpm spec:audit:reverse --all     # 扫全部 ai-cs-demo/src + erp-admin-backend/src
 *   pnpm spec:audit:reverse <token>   # 过滤某 token(只看含 token 的 export)
 *
 * 退出码:
 *   0 = 全部 export 至少被 1 个 spec 引用 或 没有改动文件
 *   1 = 至少 1 个 export 0 spec 引用(覆盖洞,需要判断是否要补 spec)
 *
 * 设计取舍:
 *  - 仍走正则不解析 AST(避免加 ts-parser 依赖;精确度靠改 main..HEAD 模式收敛范围)
 *  - export 抽 3 类:`export function` / `export const` / `export class`
 *  - 不区分 default/named(列得全一点,reviewer 自己 skip)
 *  - 用 git grep 而非系统 grep(自动忽略 node_modules / .git)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// 与 spec-audit.ts 保持一致;改这两处请同时改 spec-audit.ts
const SEARCH_DIRS = ['ai-cs-demo/src', 'erp-admin-backend/src'];
const SPEC_DIRS = ['tests/_specs', 'erp-admin-backend/test'];

/** 抽 export function x / export const x / export class X 的导出名 + 行号 */
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)|class\s+(\w+))/gm;

interface Export {
  name: string;
  file: string;
  line: number;
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walkTs(p, out);
    else if (f.endsWith('.ts') && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function findExports(file: string): Export[] {
  const text = readFileSync(file, 'utf-8');
  const out: Export[] = [];
  let m: RegExpExecArray | null;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(text)) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    if (!name) continue;
    out.push({ name, file, line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

function specMentions(token: string): string[] {
  try {
    const out = execSync(
      `git grep -l -i -- "${token}" ${SPEC_DIRS.join(' ')} 2>/dev/null`,
      { encoding: 'utf-8' },
    );
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles(): string[] {
  // 用 git status --porcelain 拿所有改动(staged + unstaged + untracked)。
  // 不用 git diff main...HEAD —— 在 main 分支上跑永远是空,在 PR CI 又不一致。
  try {
    const out = execSync('git status --porcelain --untracked-files=all', {
      encoding: 'utf-8',
    });
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3)) // 去掉 "M  " / "A  " / "??" 等 2 字符前缀
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  } catch {
    return [];
  }
}

function main() {
  const argv = process.argv.slice(2);
  const filter = argv.find((a) => !a.startsWith('--')) ?? '';
  // 有 filter 自动走全扫(filter 在 changed mode 下搜不到东西没意义)
  const all = argv.includes('--all') || filter.length > 0;

  // 1. 决定扫描文件
  const files = all
    ? [...walkTs('ai-cs-demo/src'), ...walkTs('erp-admin-backend/src')]
    : changedFiles();

  if (files.length === 0) {
    console.log('# spec-audit-reverse\n\n_没有改动文件可扫(可能 main..HEAD 没差异)。用 --all 全扫。_');
    return;
  }

  // 2. 抽 exports
  const allExports = files.flatMap((f) => findExports(f));
  const exports = filter ? allExports.filter((e) => e.name.includes(filter)) : allExports;

  if (exports.length === 0) {
    console.log(`# spec-audit-reverse\n\n_${filter ? `没有 export 名含「${filter}」` : '没有 export'}。_`);
    return;
  }

  console.log(
    `# spec-audit-reverse(${all ? '全扫' : 'changed'}): ${allExports.length} exports / 过滤后 ${exports.length}\n`,
  );

  const uncovered: Export[] = [];
  const covered: { e: Export; refs: string[] }[] = [];

  for (const e of exports) {
    const refs = specMentions(e.name);
    if (refs.length === 0) uncovered.push(e);
    else covered.push({ e, refs });
  }

  console.log(`## ✓ 已被 spec 引用(${covered.length})\n`);
  console.log('| export | 文件 | 行 | spec 引用 |');
  console.log('|---|---|---|---|');
  for (const { e, refs } of covered) {
    const refList = refs
      .map((r) => relative(process.cwd(), r))
      .map((p) => p.replace(/^tests\/_specs\//, '').replace(/^erp-admin-backend\/test\//, ''))
      .join(', ');
    console.log(`| ${e.name} | ${relative(process.cwd(), e.file)} | ${e.line} | ${refList} |`);
  }

  console.log(`\n## ⚠️ 未被 spec 引用(${uncovered.length})\n`);
  if (uncovered.length > 0) {
    console.log('| export | 文件 | 行 |');
    console.log('|---|---|---|');
    for (const e of uncovered) {
      console.log(`| ${e.name} | ${relative(process.cwd(), e.file)} | ${e.line} |`);
    }
    console.error(
      `\n✗ ${uncovered.length} 个 export 0 spec 引用(可能是覆盖率洞,或内部 helper 不需要 spec)。\n` +
        `  修法选项:\n` +
        `    1) 为该 export 补 spec\n` +
        `    2) 若确认是 internal helper,PR description 写 "no-spec-justification: <原因>"\n` +
        `    3) 重命名 export(让 grep 更精确,排除噪声)`,
    );
    process.exitCode = 1;
  } else {
    console.log('\n✅ 全部 export 至少被 1 个 spec 引用。');
  }
}

main();
