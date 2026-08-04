# CLAUDE.md — 项目入口

> AI agent / 新人进来先读这个文件,再往下钻 README / 子包文档。

---

## 这是什么

W11 ERP Admin monorepo,**3 个独立子包**,共享 docker-compose 多环境矩阵。

| 子包                  | 栈                             | 端口 | 角色                     |
| --------------------- | ------------------------------ | ---- | ------------------------ |
| `ai-cs-demo/`         | Next.js 16 + React 19          | 9529 | 终端用户智能客服对话前端 |
| `erp-admin-backend/`  | NestJS 10 + Prisma 5 + MySQL 8 | 3001 | 内部 API + AI 配置 + WS  |
| `erp-admin-frontend/` | Vite 8 + React 18 + Antd 5     | 5173 | 运营/客服管理界面        |

入口统一走 `Makefile`(help 列全部 target)。

---

## 工程约束(必须遵守)

1. **MySQL 兼容**:Prisma schema 不引 CTE / generated column / 外键约束 / `AUTO_INCREMENT`。见各子包 README。
2. **环境变量隔离**:`.env.*` 不入库;`INTERNAL_TOKEN` 三处(根 / 后端 / ai-cs-demo)须一致。
3. **日志脱敏**:`pino` 不输出 password / token / apiKey / 身份证 / 手机。
4. **公开 API** 上线前必加 `ThrottlerGuard`(或留 `// TODO(throttle)` 标注)。
5. **Schema migration** 必带 `prisma/migrations/` 文件。
6. **代码红线**:`com.iflytek` 包名残留即黄牌(W11 已迁出)。

---

## 子包"在哪看什么"

**任何问题先查这里**,别建新文档:

| 想了解                   | 看哪里                                          |
| ------------------------ | ----------------------------------------------- |
| 客服前端怎么跑/部署      | `ai-cs-demo/README.md`                          |
| 客服前端 MCP 协议        | `ai-cs-demo/docs/cs-protocol-notes.md`          |
| 客服前端 MCP server 实现 | `ai-cs-demo/docs/mcp-protocol-notes.md`         |
| 后端怎么跑/部署          | `erp-admin-backend/README.md`                   |
| 运营前端怎么跑           | `erp-admin-frontend/README.md`                  |
| 多环境 compose / 部署    | `Makefile` + 5× `docker-compose.*.yml`          |
| 多环境差异(生产 vs dev)  | `deploy/` 已删,**改读 Makefile + .env.\* 注释** |

---

## 开发循环

```bash
# 1) 看 make 列表
make help

# 2) 本地开发(make 自动起 mysql + chroma + 3 个子包)
make dev-all

# 3) 跑各自测试
pnpm --filter erp-admin-backend test
pnpm --filter v1-ai-cs-demo test         # vitest
pnpm --filter v1-ai-cs-demo exec playwright test
pnpm --filter v1-ai-cs-demo typecheck       # 批 3 #22 待修,修了再加 test

# 4) 子包内 lint / format
pnpm --filter v1-ai-cs-demo lint
pnpm --filter erp-admin-backend lint

# 5) PR 流程
#   先 fork → short-lived branch (< 24h) → PR 用根 .github/pull_request_template.md
#   commit message 走 conventional commits(commitlint 校验)
#   ai-cs-demo 的 CI 由根 .github/workflows/pr-tests.yml 的 ai-cs-demo-tests job 覆盖
#   (lint / unit / build 都在根 workflow 里跑,GitHub 不读子目录 .github/workflows/)
#   — issue #27 cleanup-wf
```

---

## 子包特有约定(都集中在子包内,不复制到根)

- `ai-cs-demo/`:见子包 README,核心交付:Next.js App Router + RAG + MCP 客服工具
- `erp-admin-backend/`:NestJS module-style,公共 API + Internal API(+ IP 白名单 + token 双因子)
- `erp-admin-frontend/`:Vite + Antd 5,Zustand 状态 + TanStack Query

每个子包**自带 README**;**不要在根建重复说明**。

---

## 还未建 / 故意不建(明确避免"配置散落")

| 不建的原因                                                                          |
| ----------------------------------------------------------------------------------- |
| 根级 `docs/adr/` —— 子包 README / docs/ 现有笔记已承担 ADR 角色,再加一层是噪音      |
| Changesets / 自动化 CHANGELOG —— 改 commitlint 顺序执行;真正多包发布时再加          |
| OpenTelemetry —— 子包直接走 pino / nestjs-pino,有需要时再加                         |
| Feature Flag 基础设施 —— 当前改动都在 PR 内,还没到"dark launch" 阶段                |
| Stacked PR / 工作树 sub-agent —— AI agent 协同在 CLAUDE.md 里点一下就够,不必写 spec |

**任何想加的东西,先问:这不是**「配置散落」**吗?**

---

## 单包内"测试/工具/e2e"

- `ai-cs-demo/scripts/` 留:`seed-faq.ts`(知识库入库)、`test-cs-*.{sh,mjs}`、`test-export-session.ts`(导出功能单测)、`capture-readme-screenshots.mjs`(README 截图)、`mcp-servers/`(客服 MCP server)
- `ai-cs-demo/docs/screenshots/` 不是过期截图,是 export feature 的入参 fixture,不要清

## Living Spec(spec 是活文档,2026-07-31 §8 落地)

**核心理念**:**spec 不是文档,是会跑的代码**。它随业务演进,跟 commit 强绑定,跟 PR review 强绑定。

| 想看                                           | 路径                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| **所有 spec 一览**(spec ↔ 业务 ↔ owner)      | [`tests/_specs/INDEX.md`](./tests/_specs/INDEX.md) |
| 动态状态面板(spec 数量 / stale / @status 漏标) | `pnpm spec:status`                                 |
| 漂移检测(spec ↔ code 漂移)                    | `pnpm spec:audit`                                  |
| CI 守门(vitest + audit + spec:status 评论)     | `.github/workflows/ssd-spec-checks.yml`            |
| 后端 spec 怎么走 jest                          | `tests/_specs/README.md` "后端 spec 跑哪里"段      |
| 整个 SSD 工作流状态                            | [`docs/ssd-status.md`](./docs/ssd-status.md)       |

**索引的维护规则**:

- **新增 spec** → 在 `INDEX.md` 加一行,设 `@status draft`
- **改 spec** → 改对应行 + 更新 last-updated
- **废弃 spec** → `@status deprecated` + INDEX 标 `superseded_by` 引用新 spec
- **季度 review** → owner 过表,把 90+ 天未动的 draft 推动 / 改需求 / 删

**自动化层**(每条都跑):

- commit-msg hook:commit 含 `[change-id]` 必能找到 spec
- PR 模板:Spec Quality Review 段 + Action 校验勾选
- CI workflow:test:spec + spec:audit + spec:status → PR 评论
- ssd-status.md 自身也是活文档,8 维度状态随时更新

---

## AI agent 协同(简短版)

详细的放 plan 文件仓外 `/Users/suesea/.claude/plans/`,不污染仓。

**Parent agent 不要:**

- 把整个项目文件读进 context
- 重复 import 同一文件
- 在对话里写完整 diff(派 sub-agent 做)

**Sub-agent 接到 brief 要:**

- 自包含(spec + 文件路径 + 行号 + 期望产出格式)
- 改完跑测、跑 spec 验证
- 回来只给 **diff stat + 测试输出**,**严格按 [`scripts/SUBAGENT_RETURN.template.md`](./scripts/SUBAGENT_RETURN.template.md) 格式**(≤ 30 行硬上限)
- brief 最后一行必附:「回包必须严格按 `scripts/SUBAGENT_RETURN.template.md` 格式,不准自由发挥」

**Worktree 隔离**:大改动用 `git worktree add .claude/worktrees/<branch> -b <name>`,改完 merge。

---

## 开发流程(Spec-Driven Development)

### 入口:你提需求时怎么写

复制下面骨架,贴出来。当骨架填齐了才开工。**填不齐 = 需求没想清楚,先回去问 stakeholder**。

```markdown
# <功能名>

## Why(为什么做)

> 1-2 句话:用户痛点 / 业务目标 / 修的 bug

## Spec (Given-When-Then)

### Scenario 1: <场景名>

Given <初始状态>
When <触发动作>
Then <外部可观察结果>

### Scenario 2: <场景名>

...

## Constraints

- 不改 schema(否则列出 migration)
- 不改公开 API(否则 changelog)
- 不影响 [其他模块]

## Out of scope

- [ ]

## Files (预估)

- <子包>/src/<path>.ts:[行号]

## Verification

- [ ] pnpm test (vitest / jest)
- [ ] pnpm exec eslint
- [ ] 手工 smoke(具体步骤)

## Risk

- 影响面:无 / 单模块 / 跨模块
- 可逆性:`git revert` / 数据 backfill
```

### 落点

你写的 Spec → AI 转成 `tests/_specs/<change-id>.spec.ts`(Given-When-Then → vitest)

- 模板:`tests/_specs/_template.spec.ts`
- 解释:`tests/_specs/README.md`

### 完整链路

```
需求(贴上面骨架)
  ↓ AI 写 spec(RED)
  ↓ worktree 分支
  ↓ sub-agent 实现(GREEN)
  ↓ diff stat + 测试输出回报
  ↓ PR(根 .github/pull_request_template.md)
  ↓ review(spec ↔ code 对齐)
  ↓ merge
```

### 各阶段责任人

| 阶段           | 谁                                                    |
| -------------- | ----------------------------------------------------- |
| Spec 写        | AI 转写,人 review (Draft → Accepted)                  |
| 实现           | sub-agent 在 worktree 改,人只在 PR review 看 diff     |
| 验证           | AI 给测试输出 + 手工 smoke 命令,人 spot-check         |
| 重构 / spec 改 | 也走 spec 流程:`tests/_specs/<id>.spec.ts` 是单一真相 |

### Commit 模板(强制带 change-id)

```
<type>(<scope>): [<change-id>] <subject>

<body 一两行解释 why,贴 spec 文件相对路径>
```

例:`fix(internal): [cs-round-001] messageCount semantic aligned to appendMessage`

为什么:**git grep** `[cs-round-001]` 能直接找出所有相关 commit / spec / commit 提的 issue,双向追溯。

### Spec Quality Rules(reviewer 必查 3 条)

每条 spec 写完 review 时按这 3 条验:

1. **外部可观察**:`Then` 必须是 DB 状态 / HTTP response / metric / WS event / UI 文本之一,**不是内部 mock 状态**(不允许 `expect(mockFn).toHaveBeenCalledWith(...)` 这种)
2. **Given-When-Then 完整**:每个 Scenario 三段都不省;happy path 至少 1 条 + 边界 / 失败 至少 1 条
3. **Out of scope 显式**:不在 spec 范围内的"可能改了/可能没改"列出来,reviewer 才好判断有没有越界

### 跨包 spec

如果一个改动同时动 `erp-admin-backend/` + `ai-cs-demo/` + `erp-admin-frontend/`:

- spec 文件仍在 `tests/_specs/<change-id>.spec.ts`
- 在 spec 顶部 `@status` 旁加一行 `// @cross-package: backend,frontend,ai-cs`
- `pnpm spec:status` 会自动识别(`crossPkg: ✓`)
- 后端 jest 跑一遍(看 erp-admin-backend/test/)+ 前端 vitest 跑一遍,spec 自身只放跨包契约级别的断言

### Spec 落点分层(3 个落点,各管各的)

| 落点                                      | 写什么                                       | 跑法                             | 例子                                           |
| ----------------------------------------- | -------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `tests/_specs/<id>.spec.ts`(根)           | 跨包 / 端到端 / 用户可见行为                 | `pnpm test:spec`                 | 新建会话、handoff ack、PII 脱敏、WS handshake  |
| `<子包>/test/<feature>.e2e-spec.ts`       | 子包内集成(NestJS supertest / vitest 跨模块) | 各自 `pnpm --filter <子包> test` | 客服 MCP 协议工具体、登录 RBAC、FAQ 检索       |
| `<子包>/src/<file>.spec.ts` / `.test.tsx` | 单元 / co-located                            | 各自 vitest / jest               | `deriveTitle` 截 30 字、`internalMessage` 解析 |

**判断方法**:

| 触发问题                        | 落点              |
| ------------------------------- | ----------------- |
| 改了某函数的不变量,用户感知不到 | 单元(co-located)  |
| 改了某模块 API,调用者感知       | 集成(子包内)      |
| 改了用户可见流程 / 跨包副作用   | **跨包 spec(根)** |

**核心原则**:**spec 不依赖任何特定子包的实现细节** → 根;否则 co-located。

**反模式**:

- ❌ 单元级 spec 写根(跑 vitest 慢、跟实现脱节)
- ❌ 跨包行为 spec 写子包(只能看到子包视角,缺全局)
- ❌ 一个 spec 文件混三层(单元 + 集成 + 跨包)— 拆

举例(代表性 3 行;完整 8 行表见 `docs/ssd-status.md`「整改 → Spec 落点对应表」段):

| 例子                                               | 落点                                      |
| -------------------------------------------------- | ----------------------------------------- |
| 跨包用户可见行为(P0-1 messageCount 语义)           | 根(backend + frontend 都感知)             |
| 子包内 NestJS 集成(P2-1 role 白名单)               | `erp-admin-backend/test/`(纯后端)         |
| 纯函数改边界(co-located,如 `deriveTitle` 截 30 字) | `<子包>/src/<file>.spec.ts` / `.test.tsx` |

### 命令速查

| 命令                                        | 干啥的                                      |
| ------------------------------------------- | ------------------------------------------- |
| `pnpm test:spec`                            | 跑所有 spec(用根 vitest 扫 `tests/_specs/`) |
| `pnpm vitest run tests/_specs/<id>.spec.ts` | 单跑某 spec(走 vitest CLI 直传 file path)   |
| `pnpm vitest run -t "scenario name"`        | 按 it() 标题过滤跑                          |
| `pnpm test:spec:watch`                      | watch 模式                                  |
| `pnpm spec:status`                          | 看 spec 状态面板(draft/accepted/...)        |
| `pnpm spec:audit`                           | 检测 spec ↔ code 漂移                      |

---

## 自己改了什么之前先问

不是"模板流程",而是真的"先看一眼":

- 子包已经有了 README / docs/`*-notes.md` —— 别建新的 doc dir
- 子包有自有 lint/test 配置 —— 别在根再抄一份
- 子包**无**私有 hooks(`ai-cs-demo/.github/workflows/` 已删 — GitHub 不读子目录 workflow,
  是死代码;lint / tsc / redlines 由根 pr-tests.yml 统一跑)— issue #27
- **新东西进项目之前**问:**这是 2026 必须的吗?** 不是 → 别加
