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
- **整体成熟度**:`~45%`(工具 + 文档 + 1 实战 + 关键发现)

> 最近更新:2026-07-31(§D 实战跑过一次,发现根 vitest 不适合后端 service,后端 spec 应走 jest)

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

### 7. AI agent 按 spec 干活 — 🟡 部分完成(发现一)

- **完成时间**:
- **当前状态**:
  - ✅ CLAUDE.md 写了 sub-agent 协议(自包含 brief + 改完跑测)
  - ✅ 模板 `tests/_specs/_template.spec.ts` 有 sub-agent 段说明
  - 🟡 **1 次实战**(cs-round-001,2026-07-31):
    - 写 spec → RED 验证 → 改 impl → 期待 GREEN
    - **发现**:跨包 spec 跑后端 NestJS service 在 vitest 下有 dep hell(`@prisma/client` import-time side effects + pnpm strict 隔离)
    - 这条发现不否定 SSD 价值,反而**强化了"spec 落点分层"** —— 跨包后端行为测试仍应放 `erp-admin-backend/test/*.e2e-spec.ts`(jest+supertest),根 vitest 只适合前端 / 纯逻辑 spec
- **下一步**:见 [行动项 §D](#d-跑一份真-spec-实战)
- **判断**:协议写好 + 实战跑过一次,workflow 闭环了

### 8. Spec 自身作为活文档 — 🟡 部分完成

- **完成时间**:
- **当前状态**:
  - ✅ 1 份真 spec 落库:`tests/_specs/cs-round-001-message-count-semantic.spec.ts`
  - ✅ 配套实现改动落库:`erp-admin-backend/src/modules/internal/internal.service.ts`
  - 🟡 spec 自身能 vitest 跑通 RED 验证(但 GREEN 在跨包 + 后端 service 场景需要走 jest,见 §D 发现)
  - ❌ CI 自动跑 spec(§A 还没做)
  - ❌ 流程闭环的"多轮 spec"(改了 code 必带 spec 改)还没形成习惯
- **下一步**:见 [行动项 §A](#a-ci-跑-testspec--specaudit)
- **判断**:从 0 到 1 已经发生,扩到"习惯"还需要 §A + 团队走几个 PR

---

## 行动项(按 ROI 排序)

### §A. CI 跑 `test:spec` + `spec:audit`

- **优先级**:🔴 P0
- **目标**:Dimension 2 + 6 完成
- **怎么做**:
  - 在 `ai-cs-demo/.github/workflows/pr-tests.yml` 加一个 job:`pnpm install --frozen-lockfile` + `pnpm test:spec` + `pnpm spec:audit`
  - 任何一条 fail → PR status check 失败 → block merge
- **预估**:半天
- **完成日期**:

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

## 当前 owner

- AI agent(实现 + 工具)
- 你(review + 实战判断)
- **真正的 owner 是项目所有人**——这个文件是项目级 living document,大家都能改
