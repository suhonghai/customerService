---
description: 从 <change-id> 跑 spec → plan + tasks 端到端(对应 spec-kit /specify /plan /tasks 三阶段)
---

按 \`scripts/spec-flow.ts\` 帮 <CHANGE_ID> 跑一次完整 spec-flow:

## 步骤

1. 跑 \`pnpm spec:flow <CHANGE_ID>\`(或单跑 plan / tasks,根据用户传入的 flag)
2. 读 stdout,提取 plan + tasks
3. 检查 spec 文件 @status — 若 draft 提醒 sub-agent 先跟 owner review spec 再派生 plan
4. 把 plan + tasks 写到 \`tests/\_specs/<CHANGE_ID>.plan.md\` 和 \`<CHANGE_ID>.tasks.md\`(\`--write\` 模式)
5. **对齐 Constitution**(plan 段已自动引用 CLAUDE.md,无需再写)
6. **跨包 spec** 额外提示:plan 含 cross-package 列,要求 sub-agent 在 worktree 同时改双侧

## 什么时候用

- 用户给 \`<CHANGE_ID>\` 后,AI 想自动生成 完整 plan + tasks 给 sub-agent brief
- 替代手写 7 段 PR description skeleton
- sub-agent 在 .claude/worktrees/ 下做改动前,先用这个派生 task list

## 不适用

- 没 spec 的 issue / brainstorming 阶段 — 先 cp \_template.spec.ts 写好 spec
- spec 已 \`@status implemented\`(改完) — spec-flow 不应该再产生新的 plan/tasks(避免过期文档)
