# V1 ai-cs-demo — 终端用户智能客服

V1 开源企业级 AI 客服系统的**终端用户对话前端**。

- 基于 Next.js 16 + React 19 + AI SDK 6
- 复用 W9-10 阶段 90% 代码,加 V1 S5 终端用户登录

## 功能

- **多会话**(sessionStorage 持久化)
- **RAG 检索**(Chroma 向量库)
- **MCP 工具**(订单查询 / FAQ 搜索 / 工单创建 / 转人工)
- **WebSocket 实时通讯**(运营后台转人工后,客户实时收到回复)
- **V1 S5 新增:终端用户登录**(邮箱 + 密码)+ **AuthGuard 路由守卫** + **userId 自动注入**

## 快速开始(本地 dev)

```bash
cd V1/ai-cs-demo
pnpm install
cp .env.example .env.development   # 已有,直接用
pnpm dev                          # http://localhost:9530
```

依赖服务:
- `erp-admin-backend` (NestJS,3001)— 提供 AI 配置 / 会话持久化 / 工单
- `chroma` (8001 / 8000)— 向量库

Docker 一键启动看 V1 root `install.sh`。

## 路由

| 路径 | 用途 | 是否需登录 |
|------|------|----------|
| `/` | 主对话页 | 是(AuthGuard) |
| `/login` | 登录页(邮箱 / 用户名 + 密码) | 否(已登录自动跳走) |
| `/api/chat` | AI 流式对话 | 是(server 端用 JWT 鉴权可选,S5 暂透传 userId) |
| `/api/sessions/upsert` | upsert 会话 → 拿后端 id | 否(内部 server-to-server) |
| `/api/sessions/[id]/history` | 拉历史消息 | 否(内部) |
| `/api/escalate` / `/api/upload-faq` 等 | 运营相关 | 否 |

## 登录流(V1 S5)

```
浏览器 ─POST /api/auth/login─> Next.js (proxy)
                                │
                                ▼
                          erp-admin-backend NestJS
                          (S3 LocalAuth)
                                │
                                ▼
                          Set-Cookie: v1_access_token (httpOnly)
                          Set-Cookie: v1_refresh_token (httpOnly)
                          response body: { user: { id, username, ... } }
                                │
                                ▼
浏览器 ←────── 200 ────────────
↓
写 v1_user_info cookie (明文缓存 user info,非凭证,仅展示)
↓
AuthGuard 调 /api/auth/me → 验证 cookie → 通过 → 渲染主页
↓
主页 sendMessage 时:body.userId = user.id → 落到 cs_session.userId
```

## 端口

- V1 默认端口:**9530**(避开 W11 ERP 9529,W9-10 ai-cs-demo 9529)

## 环境变量

详见 `.env.example`。关键:

- `NEXT_PUBLIC_API_BASE_URL`:浏览器可见的 API base(同源时留空,跨域填完整 URL)
- `ERP_ADMIN_URL`:Next.js 服务端到 backend 的 URL(docker 网络用 `http://erp-admin-backend:3001`)
- `ERP_ADMIN_TOKEN` / `INTERNAL_TOKEN`:internal API 共享 token(必须与 backend 一致)
- `JWT_SECRET`:与 backend 一致(预留,S5 暂未用 — cookie 由后端 Set-Cookie)
- `NEXT_PUBLIC_AUTH_PHONE_ENABLED` / `NEXT_PUBLIC_AUTH_EMAIL_ENABLED`:登录模式开关

## 测试

```bash
pnpm test             # vitest run
pnpm test:coverage    # 带 v8 coverage
```

## 部署

Dockerfile + entrypoint.sh 已就绪,V1 root `docker-compose.v1.yml` 编排。