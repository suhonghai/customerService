#!/usr/bin/env tsx
/**
 * spec-audit — 漂移检测
 *
 * 扫 SPEC_DIRS 下的 `*.spec.ts` / `*.e2e-spec.ts`,对每个 spec:
 *  1. 提取 it() 标题(每个 Scenario)
 *  2. 从标题里抽出"关键词"(`Then` 后的可观察结果关键词)
 *  3. grep `src/` / `prisma/` / `test/` 找有没有对应实现(排除 spec 自身)
 *  4. 输出对齐表
 *
 * 跑法:
 *   pnpm spec:audit           # 全扫
 *   pnpm spec:audit cs-round  # grep filter
 *
 * 退出码:
 *   0 = 全部 spec 至少有一条 scenario 能在代码里找到
 *   1 = 至少一条 spec 0 匹配(可能 spec 漂移或代码未实现),或一个 spec 都没扫到
 *
 * 设计取舍:
 *  - 不解析 AST(用正则抽 it() 标题足够,避免加 ts-parser 依赖)
 *  - "关键词"用 camelCase / snake_case 单词 ≥ 4 字符,过滤通用词
 *  - grep 时排除 spec 文件自身:后端 spec 就住在 SEARCH_DIRS 的 erp-admin-backend/test 里,
 *    不排除的话每个关键词都会命中 spec 自己,漂移检测恒为「全部命中」
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { extractScenarios } from './_spec-scenarios';

// 与 scripts/spec-status.ts 的 SPEC_DIRS 保持一致(2026-07-31 §D 结论:spec 有两个落点)
// - 根 tests/_specs/         → 纯前端 vitest-friendly spec
// - erp-admin-backend/test/  → 后端 jest e2e-spec / unit spec
const SPEC_DIRS = ['tests/_specs', 'erp-admin-backend/test'];
const SEARCH_DIRS = ['ai-cs-demo/src', 'erp-admin-backend/src', 'erp-admin-backend/prisma', 'erp-admin-backend/test'];

// 通用词(过滤掉,免得每个 spec 都能 grep 到)
const STOPWORDS = new Set([
  'when', 'then', 'given', 'with', 'from', 'this', 'that', 'have', 'has',
  'should', 'will', 'does', 'must', 'expect', 'returns', 'response',
  'true', 'false', 'null', 'after', 'before', 'once', 'while',
  'session', 'message', 'should', 'applies', 'shows', 'displays',
  'click', 'button', 'page', 'request', 'without',
]);

interface Spec {
  file: string;
  id: string; // 文件名(去后缀)
  scenarios: string[]; // it() 标题
  status: string | null; // 注释里的 @status
  mtime: Date;
}

function parseSpec(filepath: string): Spec {
  const content = readFileSync(filepath, 'utf-8');
  const file = basename(filepath, extname(filepath));
  const mtime = statSync(filepath).mtime;

  // 抽 it()/test() 标题(含 it.each 参数化用例)—— 与 spec-status.ts 共用同一份提取逻辑
  const scenarios = extractScenarios(content);

  // 抽 @status
  const statusMatch = /@status\s+(\w[\w-]*)/.exec(content);
  const status = statusMatch?.[1] ?? null;

  return { file: filepath, id: file, scenarios, status, mtime };
}

function keywords(scenario: string): string[] {
  // 拆词:取 camelCase / snake_case / 中文不拆(只取 4 字符以上英文 token)
  const tokens = scenario
    .replace(/[^\w\s一-鿿]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && /^[A-Za-z]/.test(w) && !STOPWORDS.has(w.toLowerCase()));
  return Array.from(new Set(tokens));
}

function grepHitCount(token: string, excludeFile?: string): number {
  // 用 git grep 比系统 grep 干净(自动忽略 node_modules)
  // excludeFile:排除 spec 自身,否则关键词必然命中它自己(后端 spec 就在 SEARCH_DIRS 里)
  const exclude = excludeFile ? ` ':!${excludeFile}'` : '';
  try {
    const out = execSync(
      `git grep -l -i -- "${token}" ${SEARCH_DIRS.join(' ')}${exclude} 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    );
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function audit(specs: Spec[]): { total: number; matched: number; drifting: Spec[] } {
  let total = 0;
  let matched = 0;
  const drifting: Spec[] = [];

  for (const spec of specs) {
    if (spec.scenarios.length === 0) continue;
    let allHit = true;
    for (const sc of spec.scenarios) {
      total += 1;
      const kws = keywords(sc);
      if (kws.length === 0) continue;
      const anyHit = kws.some((k) => grepHitCount(k, spec.file) > 0);
      if (anyHit) {
        matched += 1;
      } else {
        allHit = false;
      }
    }
    if (!allHit) drifting.push(spec);
  }
  return { total, matched, drifting };
}

function main() {
  const filter = process.argv[2] ?? '';
  const specs = SPEC_DIRS.flatMap((dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      // 两种 spec 文件后缀:*.spec.ts(根 vitest)+ *.e2e-spec.ts(后端 jest)
      // 注意:".e2e-spec.ts" 并不 endsWith(".spec.ts")(倒数第 8 位是连字符不是点),两个后缀都要判
      .filter((f) => (f.endsWith('.spec.ts') || f.endsWith('.e2e-spec.ts')) && !f.startsWith('_'))
      .filter((f) => !filter || f.includes(filter))
      .map((f) => parseSpec(join(dir, f)));
  }).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (specs.length === 0) {
    // 一个 spec 都没扫到 = 守门失效(而不是「项目还没写 spec」),必须 fail,
    // 否则 CI 会拿一份空报告当绿灯 —— 这正是 2026-08-03 审计发现的问题。
    console.error(
      `# spec-audit\n\n✗ 一个 spec 都没扫到。\n\n` +
        `已扫目录:${SPEC_DIRS.map((d) => (existsSync(d) ? d : `${d}(不存在)`)).join(', ')}\n` +
        (filter ? `过滤条件:"${filter}"\n` : '') +
        `\n若确实还没写 spec,请显式调整 SPEC_DIRS;若 spec 存在却没被扫到,说明落点与 SPEC_DIRS 不一致。`,
    );
    process.exitCode = 1;
    return;
  }

  const result = audit(specs);

  console.log('# spec-audit 报告\n');
  console.log(`**${specs.length} specs / ${result.total} scenarios / ${result.matched} 有源码匹配**\n`);

  console.log('| spec | @status | scenarios | mtime |');
  console.log('|---|---|---|---|');
  for (const s of specs) {
    const age = Math.floor((Date.now() - s.mtime.getTime()) / 86_400_000);
    console.log(
      `| ${s.id} | ${s.status ?? '—'} | ${s.scenarios.length} | ${age}d ago |`,
    );
  }

  if (result.drifting.length > 0) {
    console.log(`\n## ⚠️ 漂移候选(${result.drifting.length} 个 spec 至少一条 scenario 在代码里 0 匹配)\n`);
    for (const s of result.drifting) {
      console.log(`### ${s.id} (${s.status ?? '—'})`);
      for (const sc of s.scenarios) {
        const kws = keywords(sc);
        const hitKws = kws.filter((k) => grepHitCount(k, s.file) > 0);
        const missKws = kws.filter((k) => grepHitCount(k, s.file) === 0);
        if (missKws.length > 0) {
          console.log(`  - **${sc}**`);
          console.log(`    - 关键词未匹配:${missKws.join(', ')}`);
          if (hitKws.length > 0) console.log(`    - 已匹配:${hitKws.join(', ')}`);
        }
      }
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ 全部 spec 至少有一条 scenario 在代码里命中。');
  }
}

main();
