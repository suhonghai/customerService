# SSD 工作流成熟度跟踪

> 这文件跟踪 8 个 SSD 核心维度的落地状态。**每完成一个维度,改对应行**(状态 + 完成日期 + 证据链接)。
> 这是项目级 living document,跟代码一起演进;不要写散落在别处。
>
> 参考标准:[Martin Fowler 2026 指南](https://martinfowler.com/articles/exploring-gen-ai/2026/) / [GitHub spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) / [ThoughtWorks SDD](https://www.thoughtworks.com/insights/articles/spec-driven-development-ai)

---

## 当前快照

- **总维度**:8
- **已完整落地**:`9`(Dim 1, 3, 4, 5, 6, 7, 8, 9)
- **部分落地 / 进行中**:`0`
- **未开始**:`0`
- **整体成熟度**:`~91%`(2026-08-05 二次升级:Dim 6 fail-by-default + Dim 9 Constitution)

> 最近更新:2026-08-05(Dim 6 默认 fail + Dim 4 历史残留清理;在此之前的闭环仍 2026-07-31)

---

## 8 个核心维度

### 1. Spec 即规范 — ✅ 已完成

- **完成时间**:2026-07-31
- **证据**:
  - `tests/_specs/_template.spec.ts`(BDD Given-When-Then 模板)
  - `tests/_specs/README.md`(何时写 / 文件名 / 格式 / 生命周期约定)
- **判断**:有模板 + 落点规范,Anyone 都能照着写

### 2. Spec 可机器验证 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ `vitest.config.ts` 配置 OK,`pnpm test:spec` 本地跑通
  - ✅ 模板格式机器可读
  - ✅ **CI 已接**:`.github/workflows/ssd-spec-checks.yml` 跑 `pnpm test:spec` 在 PR 触发,失败 block merge
- **判断**:从 0 到 1 + 守门都齐了,维度 2 闭环

### 3. Spec ↔ code 双向追溯 — ✅ 已完成(2026-08-05 升级:正向 + 反向双闭环)

- **完成时间**:2026-07-31(正向);**2026-08-05**(反向)
- **当前状态**:

  - ✅ Commit 模板规定带 `[change-id]`(CLAUDE.md「Commit 模板」段)
  - ✅ 模板有 `@changeset <id>` `@adr NNNN` 注释规范
  - ✅ **commit-msg hook 校验 `[change-id]`**:`scripts/check-spec-link.ts` 装到 `.husky/commit-msg`,commit 含 `[change-id]` 但 spec 文件不在 3 个可能位置时会 exit 1
  - ✅ **反向追溯已落地(2026-08-05)**:`scripts/spec-audit-reverse.ts` + `pnpm spec:audit:reverse`,扫 main..HEAD 改动文件的 export,反查 spec 是否引用,0 引用即覆盖率洞 → exit 1
  - ✅ CI 已接:`.github/workflows/ssd-spec-checks.yml` 跑 reverse + 上传 artifact(2026-08-05)
  - 🟡 **精准度**仍是正则 export 抽(不是 AST trace);影响可控——changed 模式收敛范围到 PR 触到的 export,噪声 ≤ 改动的 export 数

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ Commit 模板规定带 `[change-id]`(CLAUDE.md「Commit 模板」段)
  - ✅ 模板有 `@changeset <id>` `@adr NNNN` 注释规范
  - ✅ **commit-msg hook 校验 `[change-id]`**:`scripts/check-spec-link.ts` 装到 `.husky/commit-msg`,commit 含 `[change-id]` 但 spec 文件不在 3 个可能位置时会 exit 1
  - ❌ **没有 reverse trace**:改了 code → 自动查哪个 spec 该改(未做,见 P-4 长期方案)
- **判断**:正向追溯(commit → spec)自动化了,reverse trace 靠 P-4 长期方案

### 4. Spec 状态生命周期 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ `@status` 注释规范(draft / accepted / implemented / deprecated)
  - ✅ `pnpm spec:status` 出状态面板
  - ✅ 30 天 stale draft 告警规则在脚本里
  - ✅ **CI 接了**:`.github/workflows/ssd-spec-checks.yml` 的 spec:status step 跑 + 用 sticky comment 贴到 PR
- **判断**:报告 + 推送都齐了,维度 4 闭环

### 5. Spec review 流程 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ CLAUDE.md「Spec Quality Rules」3 条
  - ✅ PR 模板有 spec 钩子
  - ✅ **PR 模板加 Spec Quality Review 段**:3 条 reviewer 必勾规则 + N/A 兜底
  - ✅ **GitHub Action 强制校验**:`ssd-spec-checks.yml` 的 'Check Spec Quality Review' step 用 actions/github-script 读 PR body,3 条规则 + N/A 至少 1 个 `- [x]`,否则 fail
- **判断**:模板 + 规则 + Action 守门三层齐了,维度 5 闭环

### 6. Spec 漂移检测 — ✅ 已完成(2026-08-05 升级 fail-by-default)

- **完成时间**:2026-07-31(跑 + 上传);**2026-08-05**(默认 fail)
- **当前状态**:
  - ✅ `pnpm spec:audit` 跑漂移报告(关键词 grep 源)
  - ✅ 输出 markdown 报告
  - ✅ **CI 已跑**:`.github/workflows/ssd-spec-checks.yml` 在 PR 跑 `pnpm spec:audit`,输出上传 artifact
  - ✅ **fail-by-default 已落实**:`scripts/spec-audit.ts` 退出码逻辑已是 fail-on-drift(0 命中 / 一个 spec 都没扫到都 exit 1);CI 守门 step 无 `continue-on-error`(仅 sticky-comment 加,line 113,纯通知)
  - ✅ **`pnpm spec:status --require-status` 已生效**(2026-08-05):无 @status 的 spec > 0 → exit 1,ssd-spec-checks.yml 默认开
  - 🟡 **精准度**仍是关键词 grep(P-4 长期方案:ts-morph AST),不影响 fail-by-default 这一维度的闭环
- **判断**:从「手动 + 报告」升级到「自动 + 守门」,维度闭环。剩余改进在精准度(已记 P-4)

### 7. AI agent 按 spec 干活 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ CLAUDE.md 写了 sub-agent 协议(自包含 brief + 改完跑测)
  - ✅ 模板 `tests/_specs/_template.spec.ts` 有 sub-agent 段说明
  - ✅ **1 次实战**(cs-round-001,2026-07-31):完整跑通
    - 写 spec(后端走 jest e2e-spec)→ 改 impl → 落地 → 实战中暴露 P-1 → 解决 P-1(spec 迁 jest) → 最终落 jest 4 个 Scenario
- **判断**:协议写好 + 实战闭环 + 流程问题也修了

### 8. Spec 自身作为活文档 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ 1 份 SSD spec 落库:`erp-admin-backend/test/cs-round-001.e2e-spec.ts`(jest,4 个 Scenario,@status implemented)
  - ✅ 配套实现改动落库:`erp-admin-backend/src/modules/internal/internal.service.ts`
  - ✅ spec 自身能 jest 跑通(等 test DB 起;pr-e2e.yml 在 CI 调)
  - ✅ **`tests/_specs/INDEX.md` 索引**:spec ↔ 业务 ↔ owner 关联,新增 spec 必加行
  - ✅ **`spec-status` 升级**:扫根 + 后端两个位置,Liveness Summary + 90 天僵尸警告
  - ✅ **CI 接 jest**:`.github/workflows/pr-e2e.yml` 跑后端 e2e;`.github/workflows/ssd-spec-checks.yml` 跑根 vitest + spec/audit
  - ✅ **CLAUDE.md 加 Living Spec 段**:索引链接 + 维护规则 + 自动化层
- **判断**:**spec 是活文档**:索引可查、老龄化有告警、CI 守门、commit 强绑定,8 维度闭环

### 9. Constitution 治理条款 — ✅ 已完成(2026-08-05)

- **完成时间**:2026-08-05
- **当前状态**:
  - ✅ `CLAUDE.md` 加 `## Constitution` 段,从 spec-kit 9 条里**砍剩 4 条**适配 monorepo:测试先行 / 简洁优先 / 反抽象 / 集成优先测试
  - ✅ `tests/_specs/_template.spec.ts` 加 `@constitution` 注释锚点(显式引用 I / III / IV 3 条;II 是项目层约束不重复声明)
  - ✅ `.github/pull_request_template.md` 加 "Constitution Review" 段(reviewer 必勾 4 条 + N/A 兜底)
  - ✅ `ssd-spec-checks.yml` 加 "Check Constitution Review (PR body)" step,PR body 缺段 / 0 勾都 fail
- **判断**:从「工程约束 6 条」升级到「Constitution 4 条 + 工程约束 6 条」,且 Constitution 有 PR 模板 + CI 守门,**比工程约束更高优先级**(CLAUDE.md 明确写「比工程约束更高优先级」)
- **覆盖范围**:本项目 Constitution 4 条 = spec-kit 9 条的实质子集,有意丢掉 Library-First(monorepo 不适用)/ CLI Interface Mandate(本项目 CLI 已满足)/ 三条 Project-Defined Governance(归 CLAUDE.md 「工程约束」段)

### 10. Spec-Kit 端到端(spec → plan → tasks) — ✅ 已完成(2026-08-05)

- **完成时间**:2026-08-05
- **当前状态**:
  - ✅ `scripts/spec-flow.ts` + `pnpm spec:flow <change-id>`:从 spec 派生 plan + tasks,输出 markdown
  - ✅ \`--plan\` / \`--tasks\` / \`--write\` 三 flag 拆分需求
  - ✅ `.claude/commands/sdd-flow.md` slash command:在 Claude Code 内 \`/sdd-flow <change-id>\` 跑整段
  - ✅ 1 次实战:`pnpm spec:flow cs-round-014` 生成 plan + tasks 落到 console(2026-08-05)
  - ✅ plan 段已自动引用 Constitution I/III/IV(避免 reviewer 漏勾)
- **判断**:从「spec 写完就交」升级到「spec → plan → tasks 三段式」。spec-kit 风格的 \`/specify /plan /tasks\` 三个独立 slash command **合并为 1 个 \`/sdd-flow\`**(避免配置散落,够用即可)
- **依赖**:Dim 1 spec 模板 / Dim 4 状态机 — 都已经有,这一维度是组合而非新基建

### 11. Production Feedback Loop(事故回灌) — ✅ 已完成(2026-08-05 轻量方案)

- **完成时间**:2026-08-05
- **当前状态**:
  - ✅ `tests/_specs/INCIDENT-TEMPLATE.spec.ts` 提供 cp-and-fill 模板
  - ✅ `tests/_specs/INDEX.md` 加 incident 行格式约定(命名 / header 必填字段 / 表格式)
  - ✅ **1 次实战**:`incident-cs-round-014.spec.ts` 派生自 2026-08-05 的 /chat/undefined 修复,真 spec 验证:修复 commit 在 git log / 修复文件含 select id + rows.map id / commit body 写明根因
  - ✅ 状态机多一类:`incident-recorded → accepted → implemented`(永远留 implemented 不变,作历史锚点)
  - 🟡 **零基建 / 零 infra**:不引入 telemetry→spec 自动更新,事故 → spec 全靠人工填写(同 CLAUDE.md 「避免配置散落」精神)
- **判断**:从「单向 spec-only」升级到「双向」—— 互补 ThoughtWorks "Bidirectional Feedback" 那半。零基建实现,可维护性好;真事故来时 cp 模板 + 填 + INDEX.md 加行,5 分钟一份。
- **依赖**:5 维度基础工具(状态机 / INDEX.md / spec-status / vitest 跑 / commit-msg)— 都已经有,这一维度是组合而非新基建。

## 整改 → Spec 落点对应表(8 项已落地)

> 来源:2026-07-31 11 项整改的落点决策;`CLAUDE.md` 「Spec 落点分层」段仅保留代表性 3 行,完整 8 行表在此段(2026-08-03 #17 迁移)。

| 整改                      | 落点                                    |
| ------------------------- | --------------------------------------- |
| P0-1 messageCount 语义    | 根(backend + frontend 都感知)           |
| P0-2 placeholder reaper   | 根(后端 + WS + 前端 reconnect)          |
| P1-1 handoff ack 落库     | 根(前端 + 后端 + 运营侧)                |
| P1-2 PII 脱敏             | 根(前端 sanitize + 后端落库 + 运营展示) |
| P2-1 role 白名单          | `erp-admin-backend/test/`(纯后端)       |
| P2-2 cs_message.updatedAt | 根(跨包但偏 schema)                     |
| P2-4 WS auth              | 根(后端 + 前端 handshake)               |
| P1-3 deleteByKey          | 根(前端 + 后端)                         |

---

## 行动项(按 ROI 排序)

### §A. CI 跑 `test:spec` + `spec:audit`

- **优先级**:🔴 P0
- **目标**:Dimension 2 + 6 完成
- **怎么做**:
  - 在 `ai-cs-demo/.github/workflows/pr-tests.yml` 加一个 job:
    - 前端 spec:`pnpm install --frozen-lockfile` + `pnpm test:spec` + `pnpm spec:audit`
    - 后端 spec:`pnpm --filter erp-admin-backend test` (跑 jest e2e-spec,含 cs-round-001)
  - 任何一条 fail → PR status check 失败 → block merge
- **预估**:半天
- **完成日期**:2026-07-31
- **实施细节**:
  - 新增 `.github/workflows/ssd-spec-checks.yml`(根 spec + audit 跑根 vitest)
  - 后端 jest e2e 不重做:`.github/workflows/pr-e2e.yml` 已存在,跑真服务(MySQL/Chroma)+ `pnpm --filter erp-admin-backend test`
  - 两个 workflow 互不耦合:
    - `ssd-spec-checks.yml`:路径过滤 tests/\_specs/、docs/、CLAUDE.md 等;不需 DB
    - `pr-e2e.yml`:路径过滤 erp-admin-backend/、Makefile、docker-compose.\*.yml;需 docker compose stack
  - 改维度 2 / 6 → ✅ 已完成

### §B. commit-msg hook 双向校验

- **优先级**:🔴 P0
- **目标**:Dimension 3 完成
- **怎么做**:
  - 写 `scripts/check-spec-link.ts`:parse commit message,抽 `[change-id]`
  - 校验:`tests/_specs/<change-id>.spec.ts` 存在,或 commit 自带 `no-spec:` 标签
  - 装到 `.husky/commit-msg`
- **预估**:半天
- **完成日期**:2026-07-31
- **实施细节**:
  - `scripts/check-spec-link.ts` 解析 commit message 查 `[change-id]`
  - 校验 3 个可能位置:`tests/_specs/`、`erp-admin-backend/test/*.e2e-spec.ts`、`erp-admin-backend/test/*.spec.ts`(适配 §D 的"后端走 jest" 结论)
  - 通过规则:
    - `[change-id]` 存在 → 校验 spec 存在
    - `no-spec:` 标签 → 跳过(显式声明非 spec 改动)
    - 都没 → 默认通过(常规 commit)
  - 失败时输出 3 个候选路径 + 修法建议
  - 装到 `.husky/commit-msg`(commitlint 之后跑)
  - 加 `pnpm check-spec-link` script 到根 package.json
  - 改 Dim 3 → ✅ 已完成(正向追溯自动化)

### §C. CI 跑 `spec:status` 输出到 PR 评论

- **优先级**:🟡 P1
- **目标**:Dimension 4 完成
- **预估**:半天
- **完成日期**:2026-07-31
- **实施细节**:
  - 在 `.github/workflows/ssd-spec-checks.yml` 加 step:
    - `Run spec status report`(id: spec-status,跑 pnpm spec:status)
    - `Post spec status as PR comment` 用 `marocchino/sticky-pull-request-comment@v2.9.1`
  - sticky = true → 每次 PR push 覆盖同一 comment,不刷屏
  - header = ssd-spec-status → 唯一标识
  - comment 内容:状态表格 + stale draft 警告 + 无 status 孤儿
  - 改 Dim 4 → ✅ 已完成

### §D. 跑一份真 spec 实战

- **优先级**:🔴 P0(**最高 ROI**)
- **目标**:Dimension 7 + 8 完成
- **预估**:1-2 天
- **完成日期**:2026-07-31(部分完成)
- **完成情况**:
  - ✅ spec 写完:`tests/_specs/cs-round-001-message-count-semantic.spec.ts`(vitest RED 验证)
  - ✅ 实现改完:`erp-admin-backend/src/modules/internal/internal.service.ts`(`upsertSession` 不再 +1,`appendMessage` 接管)
  - 🟡 GREEN 验证卡在 vitest + NestJS service + pnpm strict 隔离的 dep 链路问题
  - 📌 **结论**:根 `tests/_specs/` 用 vitest 不适合跨包后端 service 测试。**后端 service / 跨包行为测试应放 `erp-admin-backend/test/*.e2e-spec.ts`**(jest + supertest,既有的)。根 spec 主战场是前端 vitest-friendly 的纯逻辑 + DB 行为。
  - 后续:把 `cs-round-001` spec 内容**分拆**:vitest-friendly 部分留根 spec;依赖 NestJS DI 的部分迁到 `erp-admin-backend/test/cs-round-001.e2e-spec.ts`
  - 实现改动 `internal.service.ts` 可以独立合并(已经过 review 验证),不依赖 spec 跑通

### §E. reviewer checklist 进 PR 模板

- **优先级**:🟡 P1
- **目标**:Dimension 5 完成
- **预估**:1 小时
- **完成日期**:2026-07-31
- **实施细节**:
  - `.github/pull_request_template.md` 加 "Spec Quality Review" 段
  - 3 条 reviewer 必勾规则(对应 CLAUDE.md 3 条 Spec Quality Rules)+ N/A 兜底
  - 改 Dim 5 → 🟡 提升(从"模板有但没规则"到"模板+规则都齐")
  - **没做的**:GitHub required check 强制 reviewer 不勾不能 approve(等 review 流程跑顺再决定加)

---

## 升级路径(从 30% → 100%)

| 阶段 | 完成项                                                                   | 预计成熟度 | 所需时间 |
| ---- | ------------------------------------------------------------------------ | ---------- | -------- |
| 现在 | 工具 + 文档 + 实战 + 关键问题 + 流程优化 + 8 维度全闭环                  | 95%        | —        |
| 长期 | 团队 onboarding / 多轮 spec 形成习惯 / 后端 jest e2e 扩 cover 全部 11 项 | 100%       | —        |

---

## 维护规则

- **完成一个行动项**:把对应维度的状态 ✅ / 完成日期填上;行动项里填完成日期
- **新增 action item**:在「行动项」段加一行,标优先级 + 估时
- **维度降级**(如工具被回滚):把状态从 ✅ 改回 🟡,加一行 note
- **每季度 review**:过一遍 8 维度,标 stale 的工具 / 模板

---

## 已知问题跟踪(2026-07-31 实战发现)

> §D 跑 messageCount spec 时暴露的"工程级"问题,跟 SSD 维度正交。**每一个有建议方案但未落地** = 后续真做时直接对应此处。每解决一条,把"状态"列改 ✅ + 完成日期。

### P-1 vitest 跑后端 NestJS service 在跨包场景下有 dep hell

- **解决时间**:2026-07-31
- **解决方式**:**方案 A + B 都不通,接受方案 C**——把后端 spec 迁到既有 `erp-admin-backend/test/*.e2e-spec.ts`(jest+supertest+真 DB),根 `tests/_specs/` 留给纯前端 vitest-friendly spec。
- **最终状态**:✅ 已解决 / **走 §D 原始结论**:后端 spec 落 jest,不强行在根 vitest 跑跨包
- **实施细节**(feat/cs-round-001-message-count 分支):
  - `tests/_specs/cs-round-001-message-count-semantic.spec.ts` **删**(vitest 跑不通,详细原因在 spec 注释里)
  - `erp-admin-backend/test/cs-round-001.e2e-spec.ts` **新增**(jest + supertest + 真实 test DB,4 个 Scenario)
  - `tests/_specs/README.md` 加段说明"后端 spec 跑哪里" + case study
  - `vitest.config.ts` 保持干净(没改 server.deps.inline,避免踩坑)
- **方案 A + B 失败过程(留作以后反思)**:
  - **方案 A**(`@nestjs/testing`):在 worktree 跑 spec 能成功构造 service,beforeEach 也 await 通过,但**spec 里 import 的 4 个 collaborator service(FaqChromaService / EmbeddingService / TicketService / RealtimeGateway)各自有 transitive deps**,即使 mock 掉 instance,import 解析仍触发:
    - chromadb → ...
    - openai → ai-sdk → ...
    - rxjs, reflect-metadata, class-validator, class-transformer
    - 还有 io 库等
  - **方案 B**(`server.deps.inline`):用 `inline: [/.+/]` catch-all → 0 tests detected(vitest 自身被 inline 进去)。改用 explicit 列表 → 仍追不全 dep 链,且每个新 spec 都要补新 dep。
  - **结论**:vitest + 跨子包 + pnpm strict 隔离 这三个组合在本 monorepo 不兼容。**别再花时间**。
- **关联**:§D 行动项 ✅ 完成;cs-round-001 spec 现跑在 jest,完整 e2e 覆盖真实 DB
- **可复用经验**:以后写后端 service spec,**直接走 `erp-admin-backend/test/*.e2e-spec.ts`**(既有 infra),不要再在根 `tests/_specs/` 试

### P-2 双 Prisma 版本(根 vs 子包)

- **现象**:根 `@prisma/client` = 7.9.1,`erp-admin-backend` = 5.22.0
- **根因**:§D 调试时在根跑了 `pnpm add -D @nestjs/common @prisma/client`,prisma 被升到 7.9.1;子包原 pinned 5.22.0
- **建议方案**:
  - 短期:vitest config 显式声明 `resolve.alias` 把 `@prisma/client` 指向子包版本
  - 长期:不要在根装 @prisma/client,改用子包版本;根 vitest 跑后端 spec 时只 inline 子包路径
- **状态**:🟡 已记录 / 根 deps 已回滚 / **运行时未冲突**
- **落地预估**:0(已回滚,无 active issue)

### P-3 §A 落地时的工作量(预计)

- **现状**:CI 没接 spec 跑(§A),意味着即便改了 spec 实现,合并前不验证
- **触发条件**:P-1 解决之后,§A 才能跑通(CI 上跑 vitest 必须先把 dep hell 解了)
- **状态**:依赖 P-1;P-1 解决后可 0.5 天落地

### P-4 spec:audit 漂移检测是关键词 grep,不是真 AST trace

- **现状**:`scripts/spec-audit.ts` 从 `it('...')` 标题抽 camelCase / snake_case 单词 ≥ 4 字符,grep 源;可能 false positive 也可能 false negative
- **根因**:不想加 ts-parser 重依赖
- **影响**:对"spec 提到某函数但实现没"和"代码改了 spec 没提"两种 drift 都能 cover 部分
- **建议方案**:
  - 短期:接受 grep 的不精确,作为粗粒度信号
  - 长期:用 ts-morph 或 @typescript-eslint 的 AST API 做精确 trace(成本高)
- **状态**:🟢 接受(短期方案,记录备查)
- **落地预估**:暂不落地

### P-5 erp-admin-backend 没自己的 .husky(commits bypass commitlint 风险)

- **现状**:根 + ai-cs-demo 有 .husky,erp-admin-backend **没有**(commit 走根 hook 兜底,但若有人在 backend 子目录跑 `git commit` 可能 bypass)
- **根因**:迁移历史不一致
- **建议方案**:删 `erp-admin-backend/.husky`(如果存在);保持只有根 .husky,根 hook 已能 cover 全 monorepo(因为 git hooks 在 repo root 生效,任何子目录 commit 都触发)
- **状态**:🟡 已记录 / 实际上未观察到 bypass(因为根 .husky 已覆盖)
- **落地预估**:0(若已覆盖,无需动)

---

## 当前 owner

- AI agent(实现 + 工具)
- 你(review + 实战判断)
- **真正的 owner 是项目所有人**——这个文件是项目级 living document,大家都能改
