## Description

<!-- What is being changed and why. Keep it focused on the user-visible / system-visible behavior. -->

## Linked Issue / Task

<!--
- W11 使用 `W11-P0-NN` / `W11-P1-NN` 风格 task ID(参考 docs/superpowers/plans/)
- bug fix 引用 issue 号
- 如果有对应 spec,引用:specs/<task-id>/PRODUCT.md + TECH.md
-->
- [ ] 关联 task ID(`W11-P0-NN` / `W11-P1-NN` / `W11-P2-NN` / `W11-P3-NN` 或 issue 号)已写入标题
- [ ] 关联 spec(PRODUCT.md / TECH.md)已 approved 或本 PR 同时引入

## Testing

<!--
说明本次改动如何验证:
- 自动化测试:单元 / 集成 / E2E(命令 + 路径)
- 手动测试:步骤 + 截图 / 录屏(UI 改动必带)
- 性能验证:基准 / 压测结果
-->
- [ ] 单元测试覆盖:是 / 否(说明)
- [ ] E2E 测试覆盖:是 / 否(改动 frontend 时必带)
- [ ] 手动测试:是 / 否

### Screenshots / Videos

<!-- UI / 流程改动必带;后端纯 API 改动可省略 -->

## Engineering Redlines(工程红线,W11 现状针对性裁剪)

<!--
对所有改动 `erp-admin-backend/**` / `erp-admin-frontend/**` / `prisma/**` 业务代码的 PR:
(仅文档 / 配置 / spec 改动可在此栏写 N/A)
-->

### 代码红线

- [ ] **包名红线**:`grep -rn "com\.iflytek" erp-admin-backend/src/ erp-admin-frontend/src/ | wc -l` = 0(W11 已迁出 iflytek,残留即红线)
- [ ] **Prisma schema 兼容**:未引入 SQL CTE / generated column / FOREIGN KEY 约束 / `AUTO_INCREMENT`(MySQL 兼容 + Prisma migrate 兼容)

### 安全红线

- [ ] **环境变量隔离**:`.env.*` 未入库(`.gitignore` 已守,二次验证 `git ls-files | grep -E '^\.env\.' | grep -v '\.env\.example' | wc -l` = 0)
- [ ] **日志脱敏**:`pino` 日志未输出明文 `password` / `token` / `apiKey` / `secret` / 身份证号 / 手机号 / email(如需输出,必须 mask)
- [ ] **API 限流**:本 PR 新增的公开 API endpoint 已加 NestJS `ThrottlerGuard`(或留 `// TODO(throttle)` 标注后续补)
- [ ] **Schema 迁移**:本 PR 改动 `erp-admin-backend/prisma/schema.prisma` 时,已附 `prisma/migrations/` 文件(`pnpm prisma migrate dev` 生成)

## Risk

<!-- 评估风险等级(影响范围 / 可逆性 / 数据安全) -->

- **影响范围**:单模块 / 跨模块 / 全局
- **可逆性**:完全可回滚 / 部分可回滚 / 不可回滚(含数据迁移)
- **数据安全**:是否涉及 PII / 敏感数据 / 权限边界

## Rollout / Migration

<!-- 数据库迁移、配置变更、回滚步骤;如无填 N/A -->

## Agent Mode

<!-- 单选;若 PR 同时含 agent + 人工提交,以最后一次 push 的来源为准 -->
- [ ] 本 PR 完全由 agent automation 创建(任何工具:Claude Code / Codex / 自定义 cron 等)
- [ ] 本 PR 含人工 commit / 编辑

<!--
agent-authored PR 在此行末尾添加对应 agent 的 Co-Authored-By:
  Co-Authored-By: <Agent Name> <agent-email@example.com>
人工 PR 可省略本行。
-->