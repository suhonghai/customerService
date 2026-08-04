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

入口统一走 `Makefile`(help 列全部 target)。子包细节(跑法 / 路由 / 脚本)看各自 README。

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

| 想了解                   | 看哪里                                            |
| ------------------------ | ------------------------------------------------- |
| 客服前端怎么跑/部署      | `ai-cs-demo/README.md`                            |
| 客服前端 MCP 协议        | `ai-cs-demo/docs/cs-protocol-notes.md`            |
| 客服前端 MCP server 实现 | `ai-cs-demo/docs/mcp-protocol-notes.md`           |
| 后端怎么跑/部署          | `erp-admin-backend/README.md`                     |
| 运营前端怎么跑           | `erp-admin-frontend/README.md`                    |
| 多环境 compose / 部署    | `Makefile` + 5× `docker-compose.*.yml` + `.env.*` |

---

## 开发循环

```bash
make help              # 全部 target
make dev-all           # 本地开发(起 mysql + chroma + 3 子包)
```

子包内 `test` / `lint` / `dev` 命令见各自 README。

CI 守门走根 `.github/workflows/pr-tests.yml`(子包无私有 workflow)— issue #27 cleanup-wf。

---

## 还未建 / 故意不建(明确避免"配置散落")

| 不建                          | 原因                                                      |
| ----------------------------- | --------------------------------------------------------- |
| 根级 `docs/adr/`              | 子包 README / docs 现有笔记已承担 ADR 角色,再加一层是噪音 |
| Changesets / 自动化 CHANGELOG | 改 commitlint 顺序执行;真正多包发布时再加                 |
| OpenTelemetry                 | 子包直接走 pino / nestjs-pino,有需要时再加                |
| Feature Flag 基础设施         | 当前改动都在 PR 内,还没到"dark launch" 阶段               |
| Stacked PR / 工作树 sub-agent | AI agent 协同在 CLAUDE.md 里点一下就够,不必写 spec        |

**任何想加的东西,先问:这不是「配置散落」吗?**

---

## Living Spec(SSD)

**核心理念:spec 不是文档,是会跑的代码。**

| 想看                                         | 路径                             |
| -------------------------------------------- | -------------------------------- |
| spec ↔ 业务 ↔ owner 一览                   | `tests/_specs/INDEX.md`          |
| 8 维度工作流 / Spec Quality Rules / 命令速查 | `docs/ssd-status.md`             |
| 后端 spec 走 jest(不放在根 vitest)原因       | `tests/_specs/README.md`         |
| 入口骨架模板(vitest Given-When-Then)         | `tests/_specs/_template.spec.ts` |

维护规则:新增 / 改 / 废弃 spec 看 `INDEX.md` 头部;`commit [change-id]` 必能找到 spec(`commit-msg` hook 校验)。

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

## 开发流程(SDD)

### 入口:你提需求时怎么写

复制下面骨架,贴出来。**填不齐 = 需求没想清楚,先回去问 stakeholder**。

```markdown
# <功能名>

## Why(为什么做)

> 1-2 句话:用户痛点 / 业务目标 / 修的 bug

## Spec (Given-When-Then)

### Scenario 1: <场景名>

Given <初始状态> / When <触发动作> / Then <外部可观察结果>

## Out of scope

- [ ]

## Verification

- [ ] pnpm test (vitest / jest)
- [ ] pnpm exec eslint
- [ ] 手工 smoke(具体步骤)
```

完整 7 段模板(Constraints / Files / Risk)+ 子 agent brief 模板 → `tests/_specs/README.md`(待沉,Follow-up #2 / #3)。

### 完整链路

```
需求(贴骨架) → AI 写 spec(RED) → sub-agent 实现(GREEN) → review(spec ↔ code) → merge
```

### 各阶段责任人

| 阶段           | 谁                                                  |
| -------------- | --------------------------------------------------- |
| Spec 写        | AI 转写,人 review                                   |
| 实现           | sub-agent 在 worktree 改,人 review diff             |
| 验证           | AI 给测试输出,人 spot-check                         |
| 重构 / spec 改 | 走 spec 流程:`tests/_specs/<id>.spec.ts` 是单一真相 |

### Commit 模板(强制带 change-id)

```
<type>(<scope>): [<change-id>] <subject>
```

例:`fix(internal): [cs-round-001] messageCount semantic aligned to appendMessage`

why:**git grep** `[cs-round-001]` 反查所有 commit / spec / issue,双向追溯。

### Spec Quality Rules(reviewer 必查 3 条)

1. **外部可观察**:`Then` 必须是 DB 状态 / HTTP response / metric / WS event / UI 文本之一
2. **Given-When-Then 完整**:happy path 至少 1 条 + 边界 / 失败至少 1 条
3. **Out of scope 显式**:不在范围内的"可能改了/可能没改"列出来

反例 + 详细模板 → `docs/ssd-status.md` Dim 5。

### 跨包 spec

跨包改动 → `tests/_specs/<id>.spec.ts` 顶部加 `// @cross-package: backend,frontend,ai-cs`,`pnpm spec:status` 自动识别。

### Spec 落点分层(3 个落点,各管各的)

| 落点                            | 写什么                   | 跑法                       | 例子                         |
| ------------------------------- | ------------------------ | -------------------------- | ---------------------------- |
| 根 `tests/_specs/<id>.spec.ts`  | 跨包 / 端到端 / 用户可见 | `pnpm test:spec`           | 跨包 P0-1 messageCount 语义  |
| 子包 `<pkg>/test/*.e2e-spec.ts` | 子包内集成               | `pnpm --filter <pkg> test` | NestJS role 白名单、FAQ 检索 |
| 子包 `<pkg>/src/<file>.spec.ts` | 单元 / co-located        | vitest / jest              | `deriveTitle` 截 30 字       |

判断:改了某函数不变量 → 单元;改了某模块 API → 子包内集成;改了用户可见流程 / 跨包副作用 → 跨包 spec(根)。

8 行全表 + 反模式 → `docs/ssd-status.md` "整改 → Spec 落点对应表" 段。

### 命令速查

| 命令                                        | 干啥                   |
| ------------------------------------------- | ---------------------- |
| `pnpm test:spec`                            | 跑所有 spec(根 vitest) |
| `pnpm vitest run tests/_specs/<id>.spec.ts` | 单跑某 spec            |
| `pnpm vitest run -t "scenario"`             | 按 it() 标题过滤       |
| `pnpm spec:status`                          | spec 状态面板          |
| `pnpm spec:audit`                           | 检测 spec ↔ code 漂移 |

---

## 自己改了什么之前先问

不是"模板流程",而是真的"先看一眼":

- 子包已经有了 README / docs/`*-notes.md` —— 别建新的 doc dir
- 子包有自有 lint/test 配置 —— 别在根再抄一份
- 子包**无**私有 hooks(`ai-cs-demo/.github/workflows/` 已删 — GitHub 不读子目录 workflow,
  是死代码;lint / tsc / redlines 由根 pr-tests.yml 统一跑)— issue #27
- **新东西进项目之前**问:**这是 2026 必须的吗?** 不是 → 别加
