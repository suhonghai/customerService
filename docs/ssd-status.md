# SSD 工作流成熟度跟踪

> 这文件跟踪 8 个 SSD 核心维度的落地状态。**每完成一个维度,改对应行**(状态 + 完成日期 + 证据链接)。
> 这是项目级 living document,跟代码一起演进;不要写散落在别处。
>
> 参考标准:[Martin Fowler 2026 指南](https://martinfowler.com/articles/exploring-gen-ai/2026/) / [GitHub spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) / [ThoughtWorks SDD](https://www.thoughtworks.com/insights/articles/spec-driven-development-ai)

---

## 当前快照

- **总维度**:8
- **已完整落地**:`7`(Dim 1, 3, 4, 5, 6, 7, 8)
- **部分落地 / 进行中**:`1`(Dim 2 —— 2026-08-03 从 ✅ 降级,见下)
- **未开始**:`0`
- **整体成熟度**:`~85%`(工具链齐全且**已验证真的在跑**;扣分项:Dim 2 守门对象为空)

> 最近更新:2026-08-03(全仓健康度审计:发现并修复 4 处「守门声称已接、实则空转」,见 P-6)
>
> ⚠️ **读这份文档前请先看 P-6**。2026-07-31 曾把 8 个维度全标 ✅,但其中 4 个的 ✅ 是假的 ——
> 工具写完了,从没被喂过一个「应该失败」的输入。本文档 2026-08-03 起对每个 ✅ 补充
> 「用什么验证的」,没有验证证据的不再标 ✅。

---

## 8 个核心维度

### 1. Spec 即规范 — ✅ 已完成

- **完成时间**:2026-07-31
- **证据**:
  - `tests/_specs/_template.spec.ts`(BDD Given-When-Then 模板)
  - `tests/_specs/README.md`(何时写 / 文件名 / 格式 / 生命周期约定)
- **判断**:有模板 + 落点规范,Anyone 都能照着写

### 2. Spec 可机器验证 — 🔴 未闭环(2026-08-03 降级)

- **原标注**:2026-07-31 ✅ 已完成
- **降级原因**:`pnpm test:spec` 实际扫不到任何 spec —— `vitest.config.ts` 的 include 限定
  `tests/_specs/**/*.spec.ts`,而该目录现在只有 `_template.spec.ts`(且被 exclude),
  加上 `passWithNoTests: true`,输出是 `No test files found, exiting with code 0`。
  **所以「失败 block merge」这句话从来不成立** —— 它永远不可能失败。
- **当前状态**:
  - ✅ `vitest.config.ts` 配置本身没问题
  - ✅ 模板格式机器可读
  - ✅ CI 已接:`.github/workflows/ssd-spec-checks.yml` 会跑 `pnpm test:spec`(2026-08-03 修好坏 pin 后才真正跑起来)
  - ✅ 2026-08-03 起 `scripts/**/*.test.ts` 纳入 include,`pnpm test:spec` 从 0 tests 变成 10 passed
  - 🔴 **但根 `tests/_specs/` 仍无任何真 spec**,后端 spec 全在 jest 侧。
    「根 spec 到底该放什么」这个定位问题没解决前,这个维度不能算闭环。
- **未完项**:issue #34(`test:spec` 空转)、依赖 issue #17(Spec 落点分层定位)
- **判断**:工具链没问题,但**守门对象是空的**。标 ✅ 属于自欺。

### 3. Spec ↔ code 双向追溯 — ✅ 已完成(正向,2026-08-03 才真正生效)

- **完成时间**:2026-07-31 落地,**2026-08-03 才真正跑通**
- **当前状态**:
  - ✅ Commit 模板规定带 `[change-id]`(CLAUDE.md「Commit 模板」段)
  - ✅ 模板有 `@changeset <id>` 注释规范
  - ✅ **commit-msg hook 校验 `[change-id]`**:`scripts/check-spec-link.ts` 装到 `.husky/commit-msg`
  - ⚠️ **2026-07-31 ~ 2026-08-03 期间该校验完全空转**:git 传给 hook 的 `$1` 是相对路径
    `.git/COMMIT_EDITMSG`,而脚本用 `arg.startsWith('/')` 判断,把路径字符串本身当成了
    commit message 解析 → 永远走「默认通过」分支 exit 0。这段时间所有 commit 都是被静默放行的。
    修复见 issue #31 / PR #36,改用 `existsSync(arg)`,并补了 6 个回归 case(含相对路径这个真实调用方式)。
  - ❌ **没有 reverse trace**:改了 code → 自动查哪个 spec 该改(未做,见 P-4 长期方案)
- **判断**:正向追溯现在是真的在工作了(有回归验证);reverse trace 靠 P-4 长期方案

### 4. Spec 状态生命周期 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ `@status` 注释规范(draft / accepted / implemented / deprecated)
  - ✅ `pnpm spec:status` 出状态面板
  - ✅ 30 天 stale draft 告警规则在脚本里
  - ✅ **CI 接了**:`.github/workflows/ssd-spec-checks.yml` 的 spec:status step 跑 + 用 sticky comment 贴到 PR
  - ⚠️ **2026-07-31 ~ 2026-08-03 期间该 workflow 从未真正执行过**:它有两个不存在的 action SHA pin
    (`github-script@60a0d00439…`、`sticky-pull-request-comment@ce58e0b5…`),
    GitHub 报 `Unable to resolve action ... unable to find version`。
    根因是把 annotated tag 的 tag-object SHA 当成了 commit SHA。修复见 issue #6 / PR #36。
  - ✅ 2026-08-03 修复后首次跑通(该 workflow 首次出现 SUCCESS),
    并连带暴露 `permissions.pull-requests` 只有 `read` 导致 sticky comment 报
    `Resource not accessible by integration`,已改 `write`
  - ✅ `pnpm spec:status` 2026-08-03 修好 `it.each` 漏算(cs-round-006 曾被报 0 scenarios,见 issue #33)
- **判断**:报告 + 推送都齐了,且 2026-08-03 起**有 workflow 实际 SUCCESS 记录作为证据**,维度 4 闭环

### 5. Spec review 流程 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ CLAUDE.md「Spec Quality Rules」3 条
  - ✅ PR 模板有 spec 钩子
  - ✅ **PR 模板加 Spec Quality Review 段**:3 条 reviewer 必勾规则 + N/A 兜底
  - ✅ **GitHub Action 强制校验**:`ssd-spec-checks.yml` 的 'Check Spec Quality Review' step 用 actions/github-script 读 PR body,3 条规则 + N/A 至少 1 个 `- [x]`,否则 fail
- **判断**:模板 + 规则 + Action 守门三层齐了,维度 5 闭环

### 6. Spec 漂移检测 — ✅ 已完成

- **完成时间**:2026-07-31
- **当前状态**:
  - ✅ `pnpm spec:audit` 跑漂移报告(关键词 grep 源)
  - ✅ 输出 markdown 报告
  - ✅ **CI 已跑**:`.github/workflows/ssd-spec-checks.yml` 在 PR 跑 `pnpm spec:audit`,输出上传 artifact
  - ⚠️ **2026-07-31 ~ 2026-08-03 期间 spec:audit 完全空转**:`scripts/spec-audit.ts` 写死只扫
    `tests/_specs/`,而按 §D / P-1 结论后端 spec 已全部迁到 `erp-admin-backend/test/`,
    该目录只剩 INDEX.md / README.md / \_template.spec.ts → **13 个真 spec 全部漏检**,
    脚本打印「无 spec」后 `exit 0`,CI 拿一份空报告当绿灯。修复见 issue #8 / PR #36:
    SPEC_DIRS 与 `spec-status.ts` 对齐,0 spec 时改为 exit 1。
  - ⚠️ 同期还有两个连带 bug(issue #33):两个脚本各写各的正则,都漏 `it.each` 参数化用例;
    且 grep 时没排除 spec 自身(后端 spec 就住在 SEARCH_DIRS 里),漂移检测恒为「全部命中」。
    已抽 `scripts/_spec-scenarios.ts` 共享提取器 + 10 条回归断言根治。
  - ✅ 修复后实测:0 specs → **13 specs / 122 scenarios / 116 有源码匹配**
  - 🟡 **没 fail 阻断**(只报告,不强制)—— 这是 P-4 的权衡,长期可加 AST 强化(见已知问题段)
- **判断**:2026-08-03 起才真正在扫东西,精准度靠 P-4 长期方案

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
  - ✅ **6 份 SSD spec 落库**(cs-round-001 ~ 006,见 `tests/_specs/INDEX.md`):
    - `erp-admin-backend/test/cs-round-00{1,2,3,5,6}.e2e-spec.ts`(jest)
    - `ai-cs-demo/src/lib/pii-sanitize.test.ts`(vitest,cs-round-004)
    - 2026-08-03 起 6 份 `@status` 全部为 `implemented`,与 INDEX.md 表格一致(此前漂移,见 issue #13)
  - ✅ 配套实现改动落库:`erp-admin-backend/src/modules/internal/internal.service.ts` 等
  - ✅ spec 自身能 jest 跑通(需 test DB;`pr-e2e.yml` 在 CI 调 —— ⚠️ 该 workflow 目前仍未跑通,见 issue #37)
  - ✅ **`tests/_specs/INDEX.md` 索引**:spec ↔ 业务 ↔ owner 关联,新增 spec 必加行
  - ✅ **`spec-status` 升级**:扫根 + 后端两个位置,Liveness Summary + 90 天僵尸警告
  - ✅ **CI 接 jest**:`.github/workflows/pr-e2e.yml` 跑后端 e2e;`.github/workflows/ssd-spec-checks.yml` 跑根 vitest + spec/audit
  - ✅ **CLAUDE.md 加 Living Spec 段**:索引链接 + 维护规则 + 自动化层
  - 🟡 **8 个历史 e2e-spec 仍无 `@status` 注释**(internal / faq / ticket / order / auth-rbac / ai-config /
    session-stats-dict / integration-ai-cs-demo),`pnpm spec:status` 每次都在警告。属 P-4 已接受的权衡范围。
- **判断**:**spec 是活文档**:索引可查、老龄化有告警、commit 强绑定。
  但「CI 守门」这一条要打折 —— 后端 e2e 因 issue #37 尚未在 CI 上真正跑通过。

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

| 阶段             | 完成项                                                                   | 预计成熟度    | 所需时间 |
| ---------------- | ------------------------------------------------------------------------ | ------------- | -------- |
| 2026-07-31(自评) | 工具 + 文档 + 实战 + 关键问题 + 流程优化 + 8 维度全闭环                  | 95%(**高估**) | —        |
| 2026-08-03(实测) | 同上,但 4 个守门经实跑验证为空转并已修 3 个(见 P-6)                      | 85%           | —        |
| 下一步           | 修 issue #34(维度 2 守门对象为空)+ #37(后端 e2e 在 CI 跑通)              | 92%           | —        |
| 长期             | 团队 onboarding / 多轮 spec 形成习惯 / 后端 jest e2e 扩 cover 全部 11 项 | 100%          | —        |

> 2026-07-31 的 95% 是**没有实跑验证的自评**。2026-08-03 逐个守门喂输入实测后回退到 85%。
> 这个回退不是退步,是把虚数换成了实数 —— 详见 P-6。

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

- **原现状**:CI 没接 spec 跑(§A),意味着即便改了 spec 实现,合并前不验证
- **触发条件**:P-1 解决之后,§A 才能跑通(CI 上跑 vitest 必须先把 dep hell 解了)
- **状态**:✅ **已解决 / superseded by §A**(2026-07-31 §A 完成,CI 已接)
- **⚠️ 但注意**:§A「已接」不等于「真的在守门」。2026-08-03 审计发现接上去的三个守门
  全部空转(见 P-6),`ssd-spec-checks.yml` 直到 2026-08-03 才第一次真正跑起来。
  P-3 段在 2026-07-31 ~ 2026-08-03 期间一直写着「CI 没接」,与本文档其它段自相矛盾,
  这处矛盾本身也是「文档与事实脱节」的一例(issue #20)。

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

### P-6 「守门声称已接、实则空转」—— 本项目最严重的系统性问题(2026-08-03 发现)

> **这条优先级高于其它所有 P。** 它不是某个工具的 bug,是一种**验收方式的缺陷**,
> 会让这份文档里所有的 ✅ 失去意义。

- **现象**:2026-07-31 把 8 个维度全标 ✅,2026-08-03 全仓审计逐个实跑,发现 **4 个守门从落地起就没工作过**:

| 守门                         | 本文档曾经声称             | 实际                                         | issue        |
| ---------------------------- | -------------------------- | -------------------------------------------- | ------------ |
| `scripts/check-spec-link.ts` | 维度 3 ✅ 正向追溯已自动化 | 相对路径被当成 commit message,永远 exit 0    | #31          |
| `pnpm spec:audit`            | 维度 6 ✅ CI 已跑          | 只扫已无 spec 的目录,0 个后 exit 0           | #8           |
| `ssd-spec-checks.yml`        | 维度 4 / 5 ✅ 已闭环       | 两个 action SHA pin 不存在,workflow 从未启动 | #6           |
| `pnpm test:spec`             | 维度 2「失败 block merge」 | 0 tests + `passWithNoTests` → 永远 exit 0    | #34 **未修** |

- **根因**:**这些工具写完之后,没有任何一个被喂过一个「应该失败」的输入。**
  验收标准是「命令跑完 exit 0」,而 exit 0 既可能是「检查通过」,也可能是「压根没检查」——
  这两种情况在 CI 面板上长得一模一样。

- **为什么会连续发生 4 次**:守门工具有个共性 —— **它平时就应该 exit 0**。
  一个业务函数写错了会立刻有人报错,一个守门写错了会安静地放行所有东西,
  而「没人被拦下」看起来正好像「大家都很规范」。

- **对策(已执行)**:

  1. 每个守门必须有**反向测试**:喂一个应该被拦的输入,断言它 exit 1。
     `scripts/_spec-scenarios.test.ts` 的 10 条断言全部来自真实踩坑,是这条的第一次落地。
  2. 空输入必须 fail:`spec-audit.ts` 扫到 0 个 spec 时改为 exit 1 —— 「没东西可查」是守门失效,不是通过。
  3. 通知类步骤才允许 `continue-on-error`,守门步骤永远不允许(已写进 `ssd-spec-checks.yml` 注释)。
  4. 声称「CI 已接」时必须附**一次真实 run 的链接或结论**,不能只写「已接」。

- **对策(待执行)**:

  - 给 `check-spec-link.ts` / `spec-audit.ts` 补反向测试(目前只有 `_spec-scenarios` 有)
  - 维度 2 在 issue #34 修好前不得标 ✅

- **本文档的新规矩**:**任何 ✅ 后面必须能回答「你喂了什么输入验证它会失败?」**
  答不上来的,标 🟡。

---

## 当前 owner

- AI agent(实现 + 工具)
- 你(review + 实战判断)
- **真正的 owner 是项目所有人**——这个文件是项目级 living document,大家都能改
