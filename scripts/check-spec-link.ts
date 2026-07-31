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

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const NO_SPEC_TAG = 'no-spec:';

// 匹配 [change-id] 段,change-id 限小写字母 + 数字 + 连字符(常见命名规范)
const CHANGE_ID_RE = /\[([a-z][a-z0-9-]+)\]/g;

/**
 * 给定 change-id,返回所有可能的 spec 文件路径(按优先级排)
 * - 根 vitest spec(跨包 / 端到端 / 前端纯逻辑)
 * - 后端 jest e2e-spec
 * - 后端 jest unit spec
 */
function specPathsFor(id: string): string[] {
  return [
    resolve(ROOT, `tests/_specs/${id}.spec.ts`),
    resolve(ROOT, `erp-admin-backend/test/${id}.e2e-spec.ts`),
    resolve(ROOT, `erp-admin-backend/test/${id}.spec.ts`),
  ];
}

function main() {
  // commit-msg 传 $1 = commit message 文件路径(husky 约定)
  // 但我们也支持直接传 message 字符串(用于本地手测)
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法:tsx scripts/check-spec-link.ts <commit-message-file-or-text>');
    process.exit(1);
  }
  const message = arg.startsWith('/') ? readFileSync(arg, 'utf-8') : arg;
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
    const hits = specPathsFor(id).filter((p) => existsSync(p));
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
