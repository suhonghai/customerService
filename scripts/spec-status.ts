#!/usr/bin/env tsx
/**
 * spec-status — 状态面板
 *
 * 列出 `tests/_specs/*.spec.ts`:
 *  - @status(draft / accepted / implemented / deprecated)
 *  - 场景数(it() 计数)
 *  - 上次改动时间
 *  - 跨包还是单包(粗判:grep import 路径)
 *
 * 跑法:
 *   pnpm spec:status
 *
 * 输出:markdown table,直接粘到 PR / 周报
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { extractScenarios } from './_spec-scenarios';

// 2026-07-31 §D 结论:跨包 spec 落地有两个位置
// - 根 tests/_specs/  →  纯前端 vitest-friendly spec
// - erp-admin-backend/test/  →  后端 jest e2e-spec / unit spec
// spec-status 同时扫两边,让团队一个面板看到所有 spec
const SPEC_DIRS = ['tests/_specs', 'erp-admin-backend/test'];

interface Spec {
  id: string;
  status: string | null;
  scenarioCount: number;
  mtime: Date;
  hasChangelog: boolean;
  /** 简单判跨包:spec 文件引用了 ≥2 个子包路径就当 cross-package */
  crossPkg: boolean;
}

function parseSpec(filepath: string): Spec {
  const content = readFileSync(filepath, 'utf-8');
  const id = basename(filepath, extname(filepath));
  const mtime = statSync(filepath).mtime;

  const statusMatch = /@status\s+(\w[\w-]*)/.exec(content);
  const status = statusMatch?.[1] ?? null;

  const scenarioCount = extractScenarios(content).length;
  const hasChangelog = /@changeset\s+\S+/.test(content);

  // 跨包粗判:import 路径里出现 ≥2 个子包名前缀
  const subpackages = new Set<string>();
  for (const m of content.matchAll(/['"`]([a-z0-9-]+)\/(src|test)\//g)) {
    subpackages.add(m[1]);
  }
  const crossPkg = subpackages.size >= 2;

  return { id, status, scenarioCount, mtime, hasChangelog, crossPkg };
}

// CLI flag: --require-status
// 开了之后,任何 spec 文件没标 @status → exit 1。
// 配 .github/workflows/ssd-spec-checks.yml 用,把 spec status 从「报告」升到「守门」。
// 人手跑不开(看不顺眼但不阻拦),CI 跑(2026-08-05 P0 升级)。
const REQUIRE_STATUS_FLAG = '--require-status';

function main() {
  const requireStatus = process.argv.includes(REQUIRE_STATUS_FLAG);
  const specs = SPEC_DIRS.flatMap((dir) =>
    readdirSync(dir)
      // 两种 spec 文件后缀:*.spec.ts(根 vitest)+ *.e2e-spec.ts(后端 jest)
      .filter((f) => (f.endsWith('.spec.ts') || f.endsWith('.e2e-spec.ts')) && !f.startsWith('_'))
      .map((f) => parseSpec(join(dir, f))),
  ).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (specs.length === 0) {
    console.log('# Spec Status\n\n_暂无 spec。_');
    return;
  }

  // 状态分组
  const groups = new Map<string, Spec[]>();
  for (const s of specs) {
    const k = s.status ?? 'unspecified';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }

  console.log('# Spec Status\n');
  console.log(`总计 **${specs.length}** 个 spec,${specs.reduce((a, s) => a + s.scenarioCount, 0)} 个 scenario。\n`);

  console.log('## 按状态分组\n');
  const order = ['draft', 'accepted', 'implemented', 'deprecated', 'unspecified'];
  for (const status of order) {
    const list = groups.get(status);
    if (!list || list.length === 0) continue;
    console.log(`### ${status}(${list.length})\n`);
    console.log('| spec | scenarios | 跨包 | changeset | mtime |');
    console.log('|---|---|---|---|---|');
    for (const s of list) {
      const age = Math.floor((Date.now() - s.mtime.getTime()) / 86_400_000);
      console.log(
        `| ${s.id} | ${s.scenarioCount} | ${s.crossPkg ? '✓' : '—'} | ${s.hasChangelog ? '✓' : '—'} | ${age}d ago |`,
      );
    }
    console.log('');
  }

  // 警告:超期未实现的 draft
  const staleDrafts = specs.filter(
    (s) => (s.status ?? '') === 'draft' && Date.now() - s.mtime.getTime() > 30 * 86_400_000,
  );
  if (staleDrafts.length > 0) {
    console.log('## ⚠️ Draft 超期(> 30 天未推进)\n');
    for (const s of staleDrafts) {
      console.log(`- ${s.id}`);
    }
    console.log('');
  }

  // 警告:90 天以上未动的任何 spec(可能是僵尸)
  const zombies = specs.filter(
    (s) => Date.now() - s.mtime.getTime() > 90 * 86_400_000,
  );
  if (zombies.length > 0) {
    console.log('## 🧟 僵尸 spec(> 90 天未动,review 是否已过时)\n');
    for (const s of zombies) {
      const age = Math.floor((Date.now() - s.mtime.getTime()) / 86_400_000);
      console.log(`- ${s.id}(${s.status ?? '—'})  ${age}d old`);
    }
    console.log('');
  }

  // Liveness 段(为下游工具/团队 review 准备)
  console.log('## 🌱 Liveness Summary\n');
  const byStatus: Record<string, number> = {};
  let implemented = 0;
  for (const s of specs) {
    const k = s.status ?? 'unspecified';
    byStatus[k] = (byStatus[k] ?? 0) + 1;
    if (k === 'implemented') implemented += 1;
  }
  for (const [k, n] of Object.entries(byStatus)) {
    console.log(`- ${k}: ${n}`);
  }
  console.log(`- 实现了但 spec 还没改 @status 标记:` +
    `${specs.filter((s) => s.status === 'draft' || !s.status).length}/` +
    `${specs.length}`);

  // 警告:没有 @status 的孤儿
  const orphans = specs.filter((s) => !s.status);
  if (orphans.length > 0) {
    console.log('\n## ⚠️ 没标 @status 的 spec(请补充)\n');
    for (const s of orphans) {
      console.log(`- ${s.id}`);
    }
    if (requireStatus) {
      console.error(
        `\n✗ ${REQUIRE_STATUS_FLAG}: ${orphans.length} 条孤儿,exit 1。\n` +
          `  修法:在 spec 文件顶部加 /** @status <draft|accepted|implemented|deprecated> */`,
      );
      process.exitCode = 1;
    }
  } else if (requireStatus) {
    console.log(`\n✓ ${REQUIRE_STATUS_FLAG}:全部 spec 已标 @status`);
  }
}

main();
