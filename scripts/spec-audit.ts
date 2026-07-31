#!/usr/bin/env tsx
/**
 * spec-audit — 漂移检测
 *
 * 扫 `tests/_specs/*.spec.ts`,对每个 spec:
 *  1. 提取 it() 标题(每个 Scenario)
 *  2. 从标题里抽出"关键词"(`Then` 后的可观察结果关键词)
 *  3. grep `src/` / `prisma/` / `test/` 找有没有对应实现
 *  4. 输出对齐表
 *
 * 跑法:
 *   pnpm spec:audit           # 全扫
 *   pnpm spec:audit cs-round  # grep filter
 *
 * 退出码:
 *   0 = 全部 spec 至少有一条 scenario 能在代码里找到
 *   1 = 至少一条 spec 0 匹配(可能 spec 漂移或代码未实现)
 *
 * 设计取舍:
 *  - 不解析 AST(用正则抽 it() 标题足够,避免加 ts-parser 依赖)
 *  - "关键词"用 camelCase / snake_case 单词 ≥ 4 字符,过滤通用词
 *  - 不强制 fail:仅打印报告;CI 可决定是否要让审计 fail
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';

const SPEC_DIR = 'tests/_specs';
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

  // 抽 it() 标题(单引号/双引号/反引号三种引号都支持)
  const scenarios: string[] = [];
  const itRe = /it\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = itRe.exec(content)) !== null) {
    scenarios.push(m[1].trim());
  }

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

function grepHitCount(token: string): number {
  // 用 git grep 比系统 grep 干净(自动忽略 node_modules)
  try {
    const out = execSync(
      `git grep -l -i -- "${token}" ${SEARCH_DIRS.join(' ')} 2>/dev/null | wc -l`,
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
      const anyHit = kws.some((k) => grepHitCount(k) > 0);
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
  const specs = readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.spec.ts') && !f.startsWith('_'))
    .filter((f) => !filter || f.includes(filter))
    .map((f) => parseSpec(join(SPEC_DIR, f)))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (specs.length === 0) {
    console.log(`# spec-audit\n\n无 spec(目录 ${SPEC_DIR}/ 还没写)。`);
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
        const hitKws = kws.filter((k) => grepHitCount(k) > 0);
        const missKws = kws.filter((k) => grepHitCount(k) === 0);
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
