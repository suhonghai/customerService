#!/usr/bin/env tsx
/**
 * check-spec-link — commit-msg ↔ spec 双向校验
 *
 * 用法(由 .husky/commit-msg 自动调):
 *   tsx scripts/check-spec-link.ts "<commit message file path or text>"
 *
 * 规则:
 *  1. commit message 含 `[change-id]` 段(如 `[cs-round-001]`)
 *     → 校验 spec 文件在 3 个可能位置之一存在
 *     → 失败:exit 1 + 提示
 *  2. commit message 含 `no-spec:` 标签
 *     → 跳过校验(显式声明不需要 spec,适合纯文档 / 配置改动)
 *  3. 都没 → 默认通过(允许非 spec 类的常规改动)
 *
 * 设计:
 *  - 不解析 conventional commits 全部规则,只查 change-id(交给 commitlint)
 *  - 失败信息要明确告诉用户怎么修
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const NO_SPEC_TAG = 'no-spec:';

// 匹配 [change-id] 段,change-id 限小写字母 + 数字 + 连字符(常见命名规范)
const CHANGE_ID_RE = /\[([a-z][a-z0-9-]+)\]/g;

// 子包 co-located 单测档(CLAUDE.md "Spec 落点对应表" 第 3 档)
const SUBPACKAGE_SRC_DIRS = [
  'erp-admin-backend/src',
  'erp-admin-frontend/src',
  'ai-cs-demo/src',
] as const;

/**
 * 给定 change-id,返回所有可能的 spec 文件路径(按优先级排)
 *
 * 对应 CLAUDE.md "Spec 落点对应表" 三档:
 * - 根 vitest spec(跨包 / 端到端 / 用户可见)
 * - 后端 jest e2e-spec / unit spec
 * - 子包 <pkg>/src/<id>.test.ts(co-located 单测,2026-08 增补,见 findSubpackageSpec)
 *
 * 命名约定:子包 co-located spec 文件**直接命名为 <id>.test.ts 或 <id>.spec.ts**
 * (与 SUT 同名也可,只要文件名含 id 字面值即可;但更推荐用 id 命名以便 grep 反查)
 */
function specPathsFor(id: string): string[] {
  return [
    // 第 1 档:根 vitest 跨包 spec
    resolve(ROOT, `tests/_specs/${id}.spec.ts`),
    // 第 2 档:后端 jest
    resolve(ROOT, `erp-admin-backend/test/${id}.e2e-spec.ts`),
    resolve(ROOT, `erp-admin-backend/test/${id}.spec.ts`),
  ];
}

/**
 * 在子包 src/ 下递归找 ${id}.test.ts 或 ${id}.spec.ts(任何子文件夹)
 * Node 20+ 的 readdirSync recursive 模式,返回相对 base 的路径数组
 */
function findSubpackageSpec(id: string): string | null {
  for (const relDir of SUBPACKAGE_SRC_DIRS) {
    const base = resolve(ROOT, relDir);
    if (!existsSync(base)) continue;
    let entries: string[];
    try {
      entries = readdirSync(base, { recursive: true, withFileTypes: false }) as string[];
    } catch {
      // Node < 20 不支持 recursive 选项,跳过
      continue;
    }
    for (const f of entries) {
      // 排除目录;Node 18 不会列出目录,Node 20+ 也不会(只列文件)
      const basename = f.split('/').pop() ?? f;
      if (basename === `${id}.test.ts` || basename === `${id}.spec.ts`) {
        return resolve(base, f);
      }
    }
  }
  return null;
}

function main() {
  // commit-msg 传 $1 = commit message 文件路径(husky 约定)
  // 但我们也支持直接传 message 字符串(用于本地手测)
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法:tsx scripts/check-spec-link.ts <commit-message-file-or-text>');
    process.exit(1);
  }
  // git 传给 commit-msg hook 的 $1 是**相对路径**(.git/COMMIT_EDITMSG),
  // 所以不能用 startsWith('/') 判断是不是路径 —— 那会把路径字符串本身当成 message,
  // 导致既匹配不到 [change-id] 也匹配不到 no-spec:,永远静默放行。
  // 改用 existsSync:同时兼容绝对路径、相对路径,以及本地手测直接传 message 文本。
  const message = existsSync(arg) ? readFileSync(arg, 'utf-8') : arg;
  const firstLine = message.split('\n')[0].trim();

  // ── 规则 1:no-spec: 标签 → 跳过
  if (firstLine.includes(NO_SPEC_TAG)) {
    console.log('✓ commit 含 no-spec: 标签,跳过 spec 校验');
    return;
  }

  // ── 规则 2:含 [change-id] → 校验 spec 存在
  const ids = [...firstLine.matchAll(CHANGE_ID_RE)].map((m) => m[1]);
  if (ids.length === 0) {
    // 没 [change-id] 也没 no-spec: → 默认通过(常规 commit)
    console.log('✓ commit 不含 [change-id],通过(spec 类改动建议加)');
    return;
  }

  // 检查每个 change-id 对应的 spec 文件(任一位置存在即过)
  const missing: string[] = [];
  const found: Array<{ id: string; path: string }> = [];
  for (const id of ids) {
    const fixed = specPathsFor(id).filter((p) => existsSync(p));
    const dynamic = findSubpackageSpec(id);
    const hits = [...fixed, ...(dynamic ? [dynamic] : [])];
    if (hits.length === 0) {
      missing.push(id);
    } else {
      found.push({ id, path: hits[0] });
    }
  }

  if (missing.length > 0) {
    console.error(`\n✗ commit 含 [change-id],但对应的 spec 文件不存在:\n`);
    for (const id of missing) {
      console.error(`  - [${id}]  →  期望以下任一文件:`);
      console.error(`     • tests/_specs/${id}.spec.ts(根 vitest)`);
      console.error(`     • erp-admin-backend/test/${id}.e2e-spec.ts(后端 jest e2e)`);
      console.error(`     • erp-admin-backend/test/${id}.spec.ts(后端 jest unit)`);
      console.error(`     • <子包>/src/${id}.test.ts 或 ${id}.spec.ts(co-located 单测,任一子文件夹)`);
    }
    console.error(`\n修法(三选一):`);
    console.error(`  1. 在上述任一路径写 spec(推荐)`);
    console.error(`  2. 改 commit message,去掉 [${missing[0]}] 段(如果不该算 spec 类改动)`);
    console.error(`  3. 在 commit message 第一行加 no-spec: 显式跳过(纯文档 / 配置改动)\n`);
    process.exit(1);
  }

  console.log(`✓ ${ids.length} 个 [change-id] 全部对应 spec:`);
  for (const { id, path } of found) {
    const rel = path.replace(`${ROOT}/`, '');
    console.log(`  - [${id}]  →  ${rel}`);
  }
}

main();
