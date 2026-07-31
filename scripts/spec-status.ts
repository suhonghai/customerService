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

const SPEC_DIR = 'tests/_specs';

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

  const scenarioCount = (content.match(/it\(\s*['"`]/g) ?? []).length;
  const hasChangelog = /@changeset\s+\S+/.test(content);

  // 跨包粗判:import 路径里出现 ≥2 个子包名前缀
  const subpackages = new Set<string>();
  for (const m of content.matchAll(/['"`]([a-z0-9-]+)\/(src|test)\//g)) {
    subpackages.add(m[1]);
  }
  const crossPkg = subpackages.size >= 2;

  return { id, status, scenarioCount, mtime, hasChangelog, crossPkg };
}

function main() {
  const specs = readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.spec.ts') && !f.startsWith('_'))
    .map((f) => parseSpec(join(SPEC_DIR, f)))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

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

  // 警告:没有 @status 的孤儿
  const orphans = specs.filter((s) => !s.status);
  if (orphans.length > 0) {
    console.log('## ⚠️ 没标 @status 的 spec(请补充)\n');
    for (const s of orphans) {
      console.log(`- ${s.id}`);
    }
  }
}

main();
