# CLAUDE.md — 项目入口

> AI agent / 新人进来先读这个文件,再往下钻 README / 子包文档。

---

## 这是什么

W11 ERP Admin monorepo,**3 个独立子包**,共享 docker-compose 多环境矩阵。

| 子包 | 栈 | 端口 | 角色 |
|---|---|---|---|
| `ai-cs-demo/` | Next.js 16 + React 19 | 9529 | 终端用户智能客服对话前端 |
| `erp-admin-backend/` | NestJS 10 + Prisma 5 + MySQL 8 | 3001 | 内部 API + AI 配置 + WS |
| `erp-admin-frontend/` | Vite 8 + React 18 + Antd 5 | 5173 | 运营/客服管理界面 |

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

| 想了解 | 看哪里 |
|---|---|
| 客服前端怎么跑/部署 | `ai-cs-demo/README.md` |
| 客服前端 MCP 协议 | `ai-cs-demo/docs/cs-protocol-notes.md` |
| 客服前端 MCP server 实现 | `ai-cs-demo/docs/mcp-protocol-notes.md` |
| 后端怎么跑/部署 | `erp-admin-backend/README.md` |
| 运营前端怎么跑 | `erp-admin-frontend/README.md` |
| 多环境 compose / 部署 | `Makefile` + 5× `docker-compose.*.yml` |
| 多环境差异(生产 vs dev) | `deploy/` 已删,**改读 Makefile + .env.* 注释** |

---

## 开发循环

```bash
# 1) 看 make 列表
make help

# 2) 本地开发(make 自动起 mysql + chroma + 3 个子包)
make dev-all

# 3) 跑各自测试
pnpm --filter erp-admin-backend test
pnpm --filter ai-cs-demo test         # vitest
pnpm --filter ai-cs-demo exec playwright test

# 4) 子包内 lint / format
pnpm --filter ai-cs-demo lint
pnpm --filter erp-admin-backend lint

# 5) PR 流程
#   先 fork → short-lived branch (< 24h) → PR 用根 .github/pull_request_template.md
#   commit message 走 conventional commits(commitlint 校验)
#   ai-cs-demo 还有自己的 CI workflow:.github/workflows/{pr-tests,check-engineering-redlines,close_stale_fix_prs}.yml
```

---

## 子包特有约定(都集中在子包内,不复制到根)

- `ai-cs-demo/`:见子包 README,核心交付:Next.js App Router + RAG + MCP 客服工具
- `erp-admin-backend/`:NestJS module-style,公共 API + Internal API(+ IP 白名单 + token 双因子)
- `erp-admin-frontend/`:Vite + Antd 5,Zustand 状态 + TanStack Query

每个子包**自带 README**;**不要在根建重复说明**。

---

## 还未建 / 故意不建(明确避免"配置散落")

| 不建的原因 |
|---|
| 根级 `docs/adr/` —— 子包 README / docs/ 现有笔记已承担 ADR 角色,再加一层是噪音 |
| Changesets / 自动化 CHANGELOG —— 改 commitlint 顺序执行;真正多包发布时再加 |
| OpenTelemetry —— 子包直接走 pino / nestjs-pino,有需要时再加 |
| Feature Flag 基础设施 —— 当前改动都在 PR 内,还没到"dark launch" 阶段 |
| Stacked PR / 工作树 sub-agent —— AI agent 协同在 CLAUDE.md 里点一下就够,不必写 spec |

**任何想加的东西,先问:这不是**「配置散落」**吗?**

---

## 单包内"测试/工具/e2e"

- `ai-cs-demo/scripts/` 留:`seed-faq.ts`(知识库入库)、`test-cs-*.{sh,mjs}`、`test-export-session.ts`(导出功能单测)、`capture-readme-screenshots.mjs`(README 截图)、`mcp-servers/`(客服 MCP server)
- `ai-cs-demo/docs/screenshots/` 不是过期截图,是 export feature 的入参 fixture,不要清

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
- 回来只给 diff stat + 测试输出

**Worktree 隔离**:大改动用 `git worktree add .claude/worktrees/<branch> -b <name>`,改完 merge。

---

## 自己改了什么之前先问

不是"模板流程",而是真的"先看一眼":
- 子包已经有了 README / docs/`*-notes.md` —— 别建新的 doc dir
- 子包有自有 lint/test 配置 —— 别在根再抄一份
- 子包有私有 hooks(`ai-cs-demo/.github/workflows/`)—— 跟根 `.github/` 是两个层级,各管各的
- **新东西进项目之前**问:**这是 2026 必须的吗?** 不是 → 别加
