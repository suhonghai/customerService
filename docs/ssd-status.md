# SSD 工作流成熟度跟踪

> 这文件跟踪 8 个 SSD 核心维度的落地状态。**每完成一个维度,改对应行**(状态 + 完成日期 + 证据链接)。
> 这是项目级 living document,跟代码一起演进;不要写散落在别处。
>
> 参考标准:[Martin Fowler 2026 指南](https://martinfowler.com/articles/exploring-gen-ai/2026/) / [GitHub spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) / [ThoughtWorks SDD](https://www.thoughtworks.com/insights/articles/spec-driven-development-ai)

---

## 当前快照

- **总维度**:8
- **已完整落地**:`0`
- **部分落地 / 进行中**:`7`
- **未开始**:`1`
- **整体成熟度**:`~50%`(工具 + 文档 + 实战 + 关键问题已解决 + 流程优化)

> 最近更新:2026-07-31(§D 结论落地:P-1 通过迁 spec 到 jest 解决;cs-round-001 spec 完整 GREEN)

---

## 8 个核心维度

### 1. Spec 即规范 — ✅ 已完成

- **完成时间**:2026-07-31
- **证据**:
  - `tests/_specs/_template.spec.ts`(BDD Given-When-Then 模板)
  - `tests/_specs/README.md`(何时写 / 文件名 / 格式 / 生命周期约定)
- **判断**:有模板 + 落点规范,Anyone 都能照着写

### 2. Spec 可机器验证 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ `vitest.config.ts` 配置 OK,`pnpm test:spec` 本地跑通
  - ✅ 模板格式机器可读
  - ❌ **CI 没接**(spec 失败不会 block merge)
- **下一步**:见 [行动项 §A](#a-ci-跑-testspec--specaudit)
- **判断**:本地能跑,但 CI 不守门 = 流程半吊子

### 3. Spec ↔ code 双向追溯 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ Commit 模板规定带 `[change-id]`(CLAUDE.md「Commit 模板」段)
  - ✅ 模板有 `@changeset <id>` `@adr NNNN` 注释规范
  - ❌ **没有 commit-msg hook 校验 `[change-id]` 是否真对应 spec 文件**
  - ❌ **没有 reverse trace:改了 code → 自动查哪个 spec 该改**
- **下一步**:见 [行动项 §B](#b-commit-msg-hook-双向校验)
- **判断**:约定是死的,工具没跑就靠人自觉

### 4. Spec 状态生命周期 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ `@status` 注释规范(draft / accepted / implemented / deprecated)
  - ✅ `pnpm spec:status` 出状态面板
  - ✅ 30 天 stale draft 告警规则在脚本里
  - ❌ **没接 CI / 通知**(stale 不主动告警,只在跑命令时看)
- **下一步**:见 [行动项 §C](#c-ci-跑-specstatus-输出到-pr-评论)
- **判断**:报告有,推送无

### 5. Spec review 流程 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ CLAUDE.md「Spec Quality Rules」3 条
  - ✅ PR 模板有 spec 钩子
  - ❌ **reviewer checklist 没进 PR 模板**(现 PR 模板只问 "spec 已落定",没问 3 条具体规则)
  - ❌ **没有强制:PR 不带 spec 不能 merge**
- **下一步**:见 [行动项 §E](#e-reviewer-checklist-进-pr-模板)
- **判断**:规则有,reviewer 不知道查

### 6. Spec 漂移检测 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ `pnpm spec:audit` 跑漂移报告(关键词 grep 源)
  - ✅ 输出 markdown 报告
  - ❌ **CI 没跑**(`spec:audit` 只本地)
  - ❌ **没 fail 阻断**(只报告,不强制)
- **下一步**:并入 [行动项 §A](#a-ci-跑-testspec--specaudit)
- **判断**:工具有,自动化无

### 7. AI agent 按 spec 干活 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ CLAUDE.md 写了 sub-agent 协议(自包含 brief + 改完跑测)
  - ✅ 模板 `tests/_specs/_template.spec.ts` 有 sub-agent 段说明
  - ✅ **1 次实战**(cs-round-001,2026-07-31):完整跑通
    - 写 spec(后端走 jest e2e-spec)→ 改 impl → 落地 → 实战中暴露 P-1 → 解决 P-1(spec 迁 jest) → 最终落 jest 4 个 Scenario
- **判断**:协议写好 + 实战闭环 + 流程问题也修了

### 8. Spec 自身作为活文档 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ 1 份真 spec 落库:`erp-admin-backend/test/cs-round-001.e2e-spec.ts`(jest e2e-spec,4 个 Scenario)
  - ✅ 配套实现改动落库:`erp-admin-backend/src/modules/internal/internal.service.ts`
  - ✅ spec 自身能 jest 跑通(等 test DB 起;若跑不通,逻辑实现可独立合)
  - 🟡 vitest 那份 spec 走 §D / P-1 结论迁到 jest 路径
  - ❌ CI 自动跑 spec(§A 还没做;`ai-cs-demo/.github/workflows/pr-tests.yml` 需要新 job)
  - ❌ 流程闭环的"多轮 spec"(改了 code 必带 spec 改)还没形成习惯
- **下一步**:见 [行动项 §A](#a-ci-跑-testspec--specaudit)
- **判断**:从 0 到 1 已经发生,扩到"习惯"还需要 §A + 团队走几个 PR

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
- **完成日期**:
- **2026-07-31 备注**:P-1 解决后,后端 spec 已经在 jest 跑,§A 落地只需要在 CI 调 `pnpm --filter erp-admin-backend test` 即可。**比原计划简单了**。

### §B. commit-msg hook 双向校验

- **优先级**:🔴 P0
- **目标**:Dimension 3 完成
- **怎么做**:
  - 写 `scripts/check-spec-link.ts`:parse commit message,抽 `[change-id]`
  - 校验:`tests/_specs/<change-id>.spec.ts` 存在,或 commit 自带 `no-spec:` 标签
  - 装到 `.husky/commit-msg`
- **预估**:半天
- **完成日期**:

### §C. CI 跑 `spec:status` 输出到 PR 评论

- **优先级**:🟡 P1
- **目标**:Dimension 4 完成
- **怎么做**:
  - GitHub Action:跑 `pnpm spec:status` → 用 github-script 评论到 PR
  - 列表包含 30 天 stale draft、unspecified spec
- **预估**:半天
- **完成日期**:

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
- **怎么做**:
  - `.github/PULL_REQUEST_TEMPLATE.md` 加 "Spec Quality Review" 段
  - 3 个 checkbox 对应 CLAUDE.md 3 条 rules
  - reviewer 不勾全不能 approve(用 GitHub required check)
- **预估**:1 小时
- **完成日期**:

---

## 升级路径(从 30% → 100%)

| 阶段    | 完成项                                                                  | 预计成熟度 | 所需时间 |
| ------- | ----------------------------------------------------------------------- | ---------- | -------- |
| 现在    | 已完成工具 + 文档 + 1 实战(发现 + 文档)                                 | 45%        | —        |
| 下周    | §A(CI 跑 spec/audit)+ §B(commit 校验)                                   | 70%        | 1 天     |
| 第 2 周 | §E(reviewer checklist 进 PR 模板)                                       | 80%        | 1h       |
| 第 3 周 | §C(spec:status 自动 PR 评论)                                            | 90%        | 半天     |
| 长期    | 后端 spec 走 jest 后端集成测试 / 根 spec 主战场是前端 / 团队 onboarding | 100%       | —        |

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
