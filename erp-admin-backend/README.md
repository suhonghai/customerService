# erp-admin-backend

W11 ERP 运营后台后端 — **NestJS 10 + Prisma 5 + MySQL 8 + ChromaDB**

> Day 10 后端收口:14 模块 / 84 API / 22 表 / 100+ E2E 测试 / 100% 关键路径覆盖

## 快速启动

### 1. 起 MySQL + Chroma(Docker)

```bash
# MySQL 8.0(端口 3307,密码 root123,DB 名 erp)
docker rm -f mysql-local 2>/dev/null
docker run -d --name mysql-local -p 3307:3306 \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=erp \
  mysql:8.0

# Chroma(端口 8001,持久化到 /tmp/chroma-data)
docker rm -f chroma-local 2>/dev/null
docker run -d --name chroma-local -p 127.0.0.1:8001:8000 \
  -v /tmp/chroma-data:/chroma/.chroma \
  chromadb/chroma:latest
```

### 2. 装依赖 + migrate + seed

```bash
pnpm install
cp .env.example .env
# 编辑 .env:必填 JWT_SECRET / JWT_REFRESH_SECRET / AI_API_KEY_ENCRYPT_KEY / INTERNAL_TOKEN / DASHSCOPE_API_KEY

pnpm prisma migrate deploy
pnpm prisma db seed
```

### 3. 起 dev

```bash
# 开发模式(热重载)
pnpm start:dev

# 生产模式
pnpm build && pnpm start:prod
```

### 4. 访问

| 资源 | URL |
|---|---|
| HTTP 服务 | http://localhost:3001 |
| Swagger UI | http://localhost:3001/api/docs |
| Swagger JSON | http://localhost:3001/api/docs-json |
| 健康检查 | http://localhost:3001/api/health |
| 默认账号 | `admin` / `Admin@123` |

## 测试

```bash
# 单元测试
pnpm test

# E2E 测试(Day 10:8 suite / 106 tests / 100% pass)
pnpm test:e2e
pnpm test:e2e --runInBand       # 单线程顺序跑(推荐用于 CI)

# 单个 suite
npx jest --config ./test/jest-e2e.json --runInBand --testPathPattern=auth
```

## 模块清单(14 个)

| # | 模块 | API 数 | 路径 | 说明 |
|---|---|---|---|---|
| 1 | auth | 5 | /api/auth | 登录/refresh/me/password |
| 2 | user | 8 | /api/users | CRUD + 重置密码 + 分配角色 |
| 3 | role | 7 | /api/roles | CRUD + 分配菜单 |
| 4 | menu | 5 | /api/menus | CRUD + tree |
| 5 | ai-config | 8 | /api/ai-configs | CRUD + test + setDefault |
| 6 | ai-prompt-template | 5 | /api/ai-prompt-templates | CRUD |
| 7 | faq | 8 | /api/faq | 上传 + 版本 + 审核 + Chroma 语义检索 |
| 8 | order | 7 | /api/orders | CRUD + 状态机 + CSV 导出 |
| 9 | ticket | 8 | /api/tickets | CRUD + SLA + 流转 + stats |
| 10 | session | 4 | /api/sessions | 列表/详情/消息/软删 |
| 11 | stats | 3 | /api/stats | overview/agent/ai-hit-rate |
| 12 | dict | 6 | /api/dicts | 类型 + 项 |
| 13 | audit-log | 2 | /api/audit-logs | 列表 + 详情 |
| 14 | file | 1 | /api/files/* | 下载 |
| - | health | 1 | /api/health | 健康检查(MySQL + Chroma) |
| - | **internal** | **6** | **/api/internal/cs/\*** | **ai-cs-demo 调用(同机 IP 限制)** |

**总计 84 API**(73 后台 + 6 内部 + 5 系统 = 实际 84,含 health/auth/file/audit-log)

## 环境变量

```bash
# === 必填 ===
NODE_ENV=production                  # development | production | test
PORT=3001
DATABASE_URL=mysql://root:root123@127.0.0.1:3307/erp
JWT_SECRET=<64 hex chars>            # openssl rand -hex 32
JWT_REFRESH_SECRET=<64 hex chars>    # openssl rand -hex 32
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d
AI_API_KEY_ENCRYPT_KEY=<64 hex chars>  # AES-256 加密 AI Provider apiKey
INTERNAL_TOKEN=<64 hex chars>          # ai-cs-demo 调用内部 API 的 token
DASHSCOPE_API_KEY=sk-xxx               # 阿里云 DashScope(用于 Embedding)
CHROMA_URL=http://127.0.0.1:8001
CHROMA_COLLECTION=erp_faq
UPLOAD_DIR=/tmp/erp-admin-uploads
ALLOWED_ORIGINS=http://localhost:5173  # 前端域名(逗号分隔)
LOG_LEVEL=info

# === 可选 ===
EMBED_MODEL=text-embedding-v4
LOG_DIR=/data/logs/erp-admin
```

完整模板见 `.env.example`。

## 数据库表(22)

完整 schema 见 `prisma/schema.prisma`。核心表:

| 表 | 用途 | 关键字段 |
|---|---|---|
| sys_user | 后台账号 | username, password_hash, status, department_id |
| sys_role | 角色 | code, name, data_scope(1-4), status |
| sys_menu | 菜单/权限 | parent_id, type(1目录/2菜单/3按钮), permission |
| sys_user_role / sys_role_menu | 关联表 | - |
| sys_dict_type / sys_dict_item | 字典 | code, value, label, css_class |
| sys_audit_log | 操作审计 | user_id, module, action, status |
| ai_model_config | AI 模型配置 | code, provider, api_key(AES-256 加密), base_url |
| ai_prompt_template | Prompt 模板 | code, scene, content |
| faq_document / faq_version | FAQ 文档 + 版本 | title, status, chunks(JSON) |
| order_main / order_item | 订单 | order_no, status, total_amount |
| cs_ticket / cs_ticket_log | 工单 + 流转日志 | ticket_no, status, sla_deadline |
| cs_session / cs_message | 会话 + 消息 | session_key, role, content |
| file_meta | 文件元数据 | - |

**软删**:9 个 model(`sys_user/role/menu/dict_*` + `ai_*` + `faq_*` + `order/ticket/session`)通过 Prisma 中间件自动加 `deleted_at = NULL` 过滤。

**审计**:所有 POST/PUT/DELETE 自动写 `sys_audit_log`。

## 关键技术决策

参考 `docs/erp-admin/` 6 篇技术文档:

- `01-architecture.md` — 整体架构 + 模块依赖图
- `02-database-design.md` — 22 表 ER + 软删/审计机制
- `03-api-spec.md` — 84 API 接口规范
- `04-rbac-model.md` — 5 角色 + DataScope(scope 1-4)
- `05-deployment.md` — 生产部署 + Docker Compose
- `06-known-issues.md` — 已知问题 + 修复记录

## 集成:ai-cs-demo ↔ erp-admin

ai-cs-demo 是 AI 客服前端,通过 `X-Internal-Token` + IP 白名单(127.0.0.1/::1)调用 erp-admin 6 个内部 API:

```typescript
// 1. 启动 → 拉 AI 配置(明文 apiKey)
GET /api/internal/cs/ai-config/active

// 2. 用户问 FAQ → 语义检索(走 Chroma)
GET /api/internal/cs/faq/search?q=如何退款

// 3. 用户问订单 → 查订单
GET /api/internal/cs/orders/:orderNo

// 4. 用户转人工 → 创建工单
POST /api/internal/cs/tickets { title, content, priority }

// 5. 开新会话 → upsert session
POST /api/internal/cs/sessions { sessionKey, visitorId, aiModelCode }

// 6. 多轮对话 → 追加消息(messageCount 自动 +1)
POST /api/internal/cs/sessions/:id/messages { role, content }
```

集成测试见 `test/integration-ai-cs-demo.e2e-spec.ts`(6 用例)。

## 部署

参考 `docs/erp-admin/05-deployment.md`。生产环境:

```bash
# 1. 构建
pnpm build
# → dist/

# 2. PM2 启动
pm2 start dist/main.js --name erp-admin-backend -i max

# 3. Nginx 反向代理
location /api/ {
  proxy_pass http://127.0.0.1:3001;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 开发规范

- **分支**:从 main 拉 feature 分支,PR 合并
- **Commit**:Conventional Commits(`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`)
- **测试**:每个 API 至少 1 个 E2E case
- **软删**:9 个 model 自动 `deleted_at` 过滤,不要手写 `where: { deletedAt: null }`
- **审计**:所有 POST/PUT/DELETE 自动写 `sys_audit_log`
- **DTO 校验**:用 `class-validator`,白名单 `whitelist: true, forbidNonWhitelisted: true`
- **响应格式**:`TransformInterceptor` 统一 `{ code, message, data }`

## 目录结构

```
src/
├── main.ts                          # 入口(Swagger + Validation + 异常过滤器)
├── app.module.ts                    # 根模块(注册 14 业务模块)
├── prisma/                          # PrismaService(软删/审计中间件)
├── common/
│   ├── decorators/                  # @CurrentUser / @RequirePermissions
│   ├── guards/                      # JwtGuard / PermissionGuard / InternalGuard
│   ├── interceptors/                # TransformInterceptor
│   ├── filters/                     # HttpExceptionFilter / PrismaExceptionFilter
│   ├── pipes/                       # ValidationPipe
│   ├── exceptions/                  # BizException + BizCode
│   └── services/                    # DataScopeService / AuditLogService
└── modules/                         # 14 业务模块
    ├── auth/
    ├── user/
    ├── role/
    ├── menu/
    ├── ai-config/
    ├── ai-prompt-template/
    ├── faq/
    ├── order/
    ├── ticket/
    ├── session/
    ├── stats/
    ├── dict/
    ├── audit-log/
    ├── internal/
    ├── file/
    └── health/
prisma/
├── schema.prisma                    # 22 表定义
├── seed.ts                          # 初始数据(8 步骤)
└── migrations/                      # 自动生成
test/                                # E2E 测试(8 suite)
test/
├── ai-config.e2e-spec.ts
├── auth-rbac.e2e-spec.ts
├── faq.e2e-spec.ts
├── internal.e2e-spec.ts
├── integration-ai-cs-demo.e2e-spec.ts  # Day 10 新增
├── order.e2e-spec.ts
├── session-stats-dict.e2e-spec.ts
└── ticket.e2e-spec.ts
docs/
└── erp-admin/                       # 6 篇技术文档
```

## License

Private — W11 erp-admin 项目内部使用。