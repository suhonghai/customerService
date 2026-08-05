#!/usr/bin/env tsx
/**
 * spec-flow — 从 spec 派生 plan + tasks(spec-kit 风格端到端)
 *
 * 跟 GitHub spec-kit 风格的 `/specify /plan /tasks` 对齐,但**合并成 1 个命令**:
 *   - spec 已写好(`tests/_specs/<id>.spec.ts` 已 @status draft/accepted/implemented)
 *   - plan:从此 spec 派生文件清单 + 风险 + Out of scope
 *   - tasks:把 plan 步骤拆成可执行 task list
 *
 * 跑法:
 *   pnpm spec:flow <change-id>             # 默认输出 plan + tasks(stdout)
 *   pnpm spec:flow <change-id> --plan       # 仅 plan
 *   pnpm spec:flow <change-id> --tasks      # 仅 tasks
 *   pnpm spec:flow <change-id> --write      # 落到 tests/_specs/<id>.plan.md / .tasks.md
 *
 * 设计取舍:
 *  - 不做 SPEC 真正"派生",靠模板填空(spec 已存在才是输入)— 不替代人写 spec
 *  - 输出 markdown,直接贴 PR description 或给 sub-agent brief
 *  - 跟 Constitution 对齐(spec-flow 输出 plan 时引用 CLAUDE.md Constitution 段)
 *
 * 注意:不在 root/CI 必跑路径上 —— sub-agent 在 worktree 里手动触发,
 *      不用作 PR fail 阻断(避免阻塞创意流)。
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { extractScenarios } from './_spec-scenarios';

interface SpecMeta {
  id: string;
  file: string;
  status: string | null;
  scenarios: string[];
  crossPkg: boolean;
  headerComment: string;
}

function findSpec(changeId: string): string {
  const candidates = [
    `tests/_specs/${changeId}.spec.ts`,
    `tests/_specs/${changeId}`,
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `✗ 找不到 spec 文件:tests/_specs/${changeId}.spec.ts\n` +
      `  先 cp tests/_specs/_template.spec.ts 写好 spec,再跑 spec:flow。`,
  );
}

function parseSpec(filepath: string): SpecMeta {
  const content = readFileSync(filepath, 'utf-8');
  const id = basename(filepath, extname(filepath));

  const statusMatch = /@status\s+(\w[\w-]*)/.exec(content);
  const status = statusMatch?.[1] ?? null;

  // 抽 /** ... */ 顶部块作为 header summary
  const headerMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
  const headerComment = (headerMatch?.[1] ?? '').trim();

  // 跨包粗判
  const subpackages = new Set<string>();
  for (const m of content.matchAll(/['"`]([a-z0-9-]+)\/(src|test)\//g)) {
    subpackages.add(m[1]);
  }
  const crossPkg = subpackages.size >= 2;

  return {
    id,
    file: filepath,
    status,
    scenarios: extractScenarios(content),
    crossPkg,
    headerComment,
  };
}

function renderPlan(spec: SpecMeta): string {
  const scenariosList = spec.scenarios.map((s, i) => `${i + 1}. \`${s}\``).join('\n');
  return `# ${spec.id} — Plan

> 由 \`pnpm spec:flow ${spec.id}\` 派生 @ ${new Date().toISOString().slice(0, 10)}
> Spec 落点:${spec.file} @status ${spec.status ?? '(no @status)'}${spec.crossPkg ? ' / cross-package' : ''}

## 1. 现状摘要(spec 头)

\`\`\`
${spec.headerComment || '(spec 头部 /** ... */ 块空,建议补)'}
\`\`\`

## 2. 验收条件(scenarios)

${scenariosList}

## 3. 文件清单(规划,实际 sub-agent 在 worktree 里定)

> 对齐 Constitution III(反抽象)— 不引入 wrapper / repository / cache 例行抽象

- [ ] **改 src** — [module]/src/[file].ts:[line] 引用 spec scenario i
- [ ] **(若 schema 改)** — [module]/prisma/schema.prisma + 附 prisma/migrations/(sql 文件)
- [ ] **(若跨包)** — 联调两侧:后端契约 + 前端 fallback(见 ${spec.crossPkg ? 'cross-package' : '——'}列)
- [ ] **不引入** 新子包 / 新 framework / 新 abstraction layer(Constitution II/III)

## 4. 风险

- **影响范围**:${spec.crossPkg ? '跨包(后端 + 前端)' : '单包'} —
- **可逆性**:完全可回滚(改 src) / 部分(若涉及 schema migration)
- **数据安全**:是否涉及 PII / 权限边界 — 由 spec reviewer 判断

## 5. Out of scope(显式排除)

- [ ] <不在本次改动范围 / 可能误改的项>
- [ ] refactor / rename / 文档更新 单列 PR

## 6. Constitution Review

> \`CLAUDE.md\` ## Constitution 段,改动任何业务代码 reviewer 必勾。

- [ ] **I. 测试先行**:spec 已 GREEN 在 \`tests/_specs/${spec.id}.spec.ts\`
- [ ] **II. 简洁优先**:未引入新工具 / 抽象
- [ ] **III. 反抽象**:直接用 framework 原生 feature
- [ ] **IV. 集成优先**:spec 走 test DB / supertest / 真 gateway

---

完成定义(本文 Plan 自身):tasks 列表在 \`tests/_specs/${spec.id}.tasks.md\`(\`--write\` 时生成),所有 task 打勾后即可提 PR。
`;
}

function renderTasks(spec: SpecMeta): string {
  // 默认 tasks 按 spec scenarios 一对一映射;reviewer 可手动加 task
  const scenarioTasks = spec.scenarios.map(
    (s, i) => `- [ ] T${String(i + 1).padStart(2, '0')}:实现 scenario ${i + 1} — \`${s}\``,
  );

  return `# ${spec.id} — Tasks

> 由 \`pnpm spec:flow ${spec.id}\` 派生 @ ${new Date().toISOString().slice(0, 10)}
> 每完成一项打勾;全部打勾后,可提 PR。

## 1. spec scenarios 实现(${spec.scenarios.length} 条)

${scenarioTasks.join('\n')}

## 2. 通用前置任务

- [ ] T01:在 worktree 里 \`git worktree add .claude/worktrees/${spec.id} -b ${spec.id}\`
- [ ] T02:跑 \`pnpm test:spec tests/_specs/${spec.id}.spec.ts\` 确认 RED
- [ ] T03:实现,逐条 scenario 跑 GREEN
- [ ] T04:\`pnpm spec:status --require-status\` 不 fail / \`pnpm spec:audit\` 0 drift
- [ ] T05:\`pnpm spec:audit:reverse\` 0 uncovered(or PR desc 写 \`no-spec-justification\`)
- [ ] T06:lint / tsc / 子包 test 全绿

## 3. PR 提交前

- [ ] T07:commit 用模板 \`<type>(<scope>): [<change-id>] <subject>\`
- [ ] T08:PR description 贴 \`<id>.plan.md\`(粘贴文件内容 / 链接)
- [ ] T09:PR template 里勾 Constitution Review + Spec Quality Review(若是 spec 修改)
- [ ] T10:本 tasks.md 全部勾完后,执行 merge;merge 后 \`@status accepted → implemented\`
`;
}

function main() {
  const argv = process.argv.slice(2);
  const changeId = argv.find((a) => !a.startsWith('--'));
  if (!changeId) {
    console.error('用法:pnpm spec:flow <change-id> [--plan] [--tasks] [--write]');
    process.exit(1);
  }

  const onlyPlan = argv.includes('--plan');
  const onlyTasks = argv.includes('--tasks');
  const writeMode = argv.includes('--write');

  const specFile = findSpec(changeId);
  const spec = parseSpec(specFile);

  if (spec.scenarios.length === 0) {
    console.error(`✗ spec 文件 ${specFile} 没有 it() scenario,无法派生。先写 spec。`);
    process.exit(1);
  }

  const plan = renderPlan(spec);
  const tasks = renderTasks(spec);

  if (writeMode) {
    const planPath = resolve(specFile, '..', `${changeId}.plan.md`);
    const tasksPath = resolve(specFile, '..', `${changeId}.tasks.md`);
    require('node:fs').writeFileSync(planPath, plan, 'utf-8');
    require('node:fs').writeFileSync(tasksPath, tasks, 'utf-8');
    console.error(`✓ 已写:\n  ${planPath}\n  ${tasksPath}\n`);
    return;
  }

  if (!onlyTasks) console.log(plan);
  if (!onlyPlan) console.log('\n---\n\n' + tasks);
}

main();
