## Description

<!-- What is being changed and why. Keep it focused on the user-visible / system-visible behavior. -->

## Linked Issue / Task

<!--
- W9-10 使用 `W9-10-P0-NN` / `W9-10-P1-NN` / `W9-10-P2-NN` 风格 task ID(参考 docs/superpowers/plans/)
- bug fix 引用 issue 号
- 如果有对应 spec,引用:specs/<task-id>/PRODUCT.md + TECH.md
-->

- [ ] 关联 task ID(`W9-10-P0-NN` / `W9-10-P1-NN` / `W9-10-P2-NN` 或 issue 号)已写入标题
- [ ] 关联 spec(PRODUCT.md / TECH.md)已 approved 或本 PR 同时引入

## Testing

<!--
说明本次改动如何验证:
- 自动化测试:单元 / 集成 / E2E(命令 + 路径)
- 手动测试:步骤 + 截图 / 录屏(UI 改动必带)
- 性能验证:基准 / 压测结果
-->

- [ ] 单元测试覆盖:是 / 否(说明)
- [ ] E2E 测试覆盖:是 / 否(改动 chat UI / 实时通信时必带)
- [ ] 手动测试:是 / 否
- [ ] Lint + Type check 全过(`pnpm lint` + `pnpm exec tsc --noEmit`)

### Screenshots / Videos

<!-- UI / 流程改动必带;纯 API / lib 改动可省略 -->

## Engineering Redlines(工程红线,ai-cs-demo 现状针对性裁剪)

<!--
对所有改动 `src/**` / `scripts/**` / `next.config.ts` / `tsconfig.json` 业务代码的 PR:
(仅文档 / spec / README 改动可在此栏写 N/A)
-->

### 代码红线

- [ ] **不引 DASHSCOPE_API_KEY 硬编码**(走 `.env.local` 或 `src/lib/ai-config.ts` 热重载;验证 `grep -RnE "DASHSCOPE_API_KEY\s*[:=]\s*['\"]sk-[A-Za-z0-9_-]{8,}" --include="*.ts" --include="*.tsx" --include="*.mjs" src/ scripts/ | wc -l` = 0)
- [ ] **不引明文 console.log/debug**(允许 `src/lib/ai-config.ts` 的 refresh log + `entrypoint.sh`;验证 `grep -RnE "console\.(log|debug)" --include="*.ts" --include="*.tsx" --exclude="*.test.*" --exclude="src/lib/ai-config.ts" --exclude="entrypoint.sh" src/ scripts/ | wc -l` = 0)

### 安全红线

- [ ] **MCP server 路径不硬编码绝对路径**(用 `path.join(process.cwd(), ...)` 或 `MCP_ALLOWED_ROOTS` env;验证 `grep -RnE "['\"](\/home\/|\/Users\/)[^/'\"]+" --include="*.ts" --include="*.tsx" --exclude="*.test.*" src/lib/agent/ scripts/mcp-servers/ | wc -l` = 0)
- [ ] **不引 Next.js `ignoreBuildErrors: true` 绕过**(如需绕过,在 PR 描述里说明原因;`next.config.ts` 改动必须列出影响范围)
- [ ] **`.env.*` 不入库**(`.gitignore` 已守,二次验证 `git ls-files | grep -E '^\.env\.' | grep -v '\.env\.example' | wc -l` = 0)
- [ ] **改动 `next.config.ts` / `tsconfig.json` 在 PR 描述说明影响范围**(SWR / Image / build target / strict mode 等)

## Risk

<!-- 评估风险等级(影响范围 / 可逆性 / 数据安全) -->

- **影响范围**:单模块 / 跨模块 / 全局
- **可逆性**:完全可回滚 / 部分可回滚 / 不可回滚(含数据迁移)
- **数据安全**:是否涉及 PII / 敏感数据 / 权限边界 / Chroma collection 写入

## Rollout / Migration

<!-- 环境变量变更、Chroma collection 重建、回滚步骤;如无填 N/A -->

## Agent Mode

<!-- 单选;若 PR 同时含 agent + 人工提交,以最后一次 push 的来源为准 -->

- [ ] 本 PR 完全由 agent automation 创建(任何工具:Claude Code / Codex / 自定义 cron 等)
- [ ] 本 PR 含人工 commit / 编辑

<!--
agent-authored PR 在此行末尾添加对应 agent 的 Co-Authored-By:
  Co-Authored-By: <Agent Name> <agent-email@example.com>
人工 PR 可省略本行。
-->

> 自动 commit 来源以最后一次 push 的 commit author 为准。
