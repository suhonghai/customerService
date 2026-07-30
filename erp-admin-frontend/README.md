# erp-admin-frontend

W11 ERP 运营后台前端 — Vite 8 + React 18 + Antd 5

## 启动

```bash
pnpm install

cp .env.example .env
# .env 默认:VITE_API_BASE_URL=http://localhost:3001/api
# 后端启动后访问 http://localhost:3001/api

pnpm dev          # 开发模式 → http://localhost:5173
# 或生产构建:
pnpm build        # 产物在 dist/,含 dist/stats.html bundle 可视化
pnpm preview      # 本地预览生产构建
```

## 技术栈

- **构建**:Vite 8 + TypeScript 5 + Oxlint + rollup-plugin-visualizer
- **UI**:Antd 5.29(`destroyOnHidden`) + @ant-design/icons + @ant-design/charts
- **响应式**:react-responsive(统一断点 hook)
- **路由**:React Router 6(ProtectedRoute 守卫)
- **状态**:Zustand(auth 持久化) + TanStack Query(服务端态)
- **HTTP**:Axios + 拦截器(自动加 Authorization、统一错误处理)

## 目录

```
src/
├── main.tsx                # 入口(ConfigProvider / QueryClientProvider)
├── App.tsx                 # 路由出口
├── pages/                  # 业务页面
│   ├── Login/              # 登录页(演示账号一键填充)
│   ├── Dashboard/          # 看板(欢迎卡 + 统计 + 快速入口)
│   ├── User/               # 用户 CRUD + 状态 + 角色绑定
│   ├── Role/               # 角色 CRUD + 分配菜单(Tree)
│   ├── Menu/               # 菜单/按钮 CRUD(类型 1/2/3)
│   ├── Profile/            # 个人信息 + 改密码
│   ├── Session/            # 会话监控列表 + 详情 Drawer
│   ├── Stats/              # 总览(Line Chart)+ 客服绩效 + AI 命中率(Column Chart)
│   ├── AuditLog/           # 操作审计 + 多维度筛选 + Tabs 详情
│   ├── Dict/               # 数据字典(类型 + 项,2 个 Table)
│   ├── NotFound/           # 404
│   └── NoPermission/       # 403
├── services/               # API 封装(axios + 类型)
│   ├── request.ts          # 拦截器 + 错误归一化
│   ├── auth.ts             # 登录 / /me / /refresh
│   ├── user.ts / role.ts / menu.ts
│   ├── profile.ts          # /auth/me + /auth/password
│   ├── session.ts / stats.ts / audit-log.ts / dict.ts
├── stores/                 # Zustand
│   ├── auth.ts             # accessToken + refreshToken + userInfo(持久化)
│   └── menu.ts             # 菜单树缓存
├── components/
│   ├── PermissionButton.tsx # 按钮级权限包装
│   └── States.tsx          # Loading/Empty/Error 通用态
├── layouts/
│   ├── BasicLayout.tsx     # 主布局(Sider + Header + Breadcrumb + Outlet)
│   └── BlankLayout.tsx     # 登录页布局
├── router/
│   ├── index.tsx           # 路由表
│   ├── ProtectedRoute.tsx  # token + 权限守卫
│   └── route-map.ts        # 路由 → 面包屑中文映射(Day 15)
└── utils/
    ├── permission.ts       # hasPermission(支持 `*` 通配)
    └── antd-compat.ts      # Antd 5.20+ destroyOnHidden 常量
```

## 测试账号(开发环境)

| 用户名 | 密码 | 角色 | 可访问 |
|---|---|---|---|
| `admin` | `Admin@123` | super_admin | 全部菜单 + 全部按钮 |
| `agent_lead01` | `Lead@123` | agent_lead | 本部门数据 |
| `agent01` | `Agent@123` | agent | 仅本人工单/会话 |
| `editor01` | `Editor@123` | editor | FAQ / 订单 / 字典 |

> 登录页底部"演示账号"按钮可一键填充。

## 移动端

- 断点 **< 768px**(可通过 `BasicLayout` 的 `MOBILE_BREAKPOINT` 调整)
- 用 `useMediaQuery({ maxWidth: 767 })`(react-responsive)替代自写 `window.innerWidth` 监听
- Sider 隐藏,改用 Header 的 `☰` 按钮 + 左侧 Drawer
- Dashboard 卡片栅格改为 `xs={24} sm={12} md={8}`,移动端单列
- Table 加 `scroll={{ x: 1200 }}` 横滑(超窄屏友好)

## 通用态

`src/components/States.tsx` 导出三个组件:

```tsx
import { LoadingState, EmptyState, ErrorState } from '@/components/States';

const { data, isLoading, error, refetch } = useQuery({ ... });

if (error) return <ErrorState error={error as Error} onRetry={refetch} />;
if (isLoading) return <LoadingState />;
if ((data?.list || []).length === 0) return <EmptyState description="暂无用户" />;
```

已在 User / Role / Menu 三个基础页接入。

## 性能与 Bundle

### 拆分策略(`vite.config.ts`)

```ts
manualChunks(id) {
  if (id.includes('/react/') || ...)            return 'react-vendor';
  if (id.includes('/antd/') || ...)             return 'antd-vendor';
  if (id.includes('/@tanstack/') || ...)        return 'query-vendor';
}
```

四个 vendor chunk:

- `react-vendor` — react + react-dom + react-router-dom(~20KB / gzip 7KB)
- `antd-vendor` — antd + icons + **charts(G2/G2Plot,懒加载)**(~3.5MB / gzip 1MB)
- `query-vendor` — @tanstack/react-query + zustand(~40KB / gzip 12KB)
- `index` — 业务代码(~106KB / gzip 34KB)

> `antd-vendor` 因为 @ant-design/charts 拉入 G2 较大,**Stats 页用 `React.lazy` 按需加载**,
> 用户不进 Stats 页就不下载 charts 依赖。

### Bundle 可视化

```bash
pnpm build              # 生成 dist/index.html + dist/assets/* + dist/stats.html
```

`dist/stats.html` 是 [rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer)
生成的交互式 treemap,直观显示:

- 每个模块 gzip 后体积
- 依赖关系网
- 哪些包能进一步拆分

直接浏览器打开 `dist/stats.html` 即可查看。

### 性能指标

| 指标 | 目标 | 实测 |
|---|---|---|
| `pnpm build` error | 0 | 0 |
| 首屏 `index` chunk gzip | < 50KB | ~34KB |
| react-vendor gzip | < 10KB | ~7KB |
| query-vendor gzip | < 15KB | ~12KB |
| antd-vendor gzip(全部加载) | < 1.2MB | ~1.05MB |
| stats.html 生成 | yes | yes |

> antd-vendor 在未访问 Stats 页时不加载(React.lazy),实际首屏请求体仅 `index + react-vendor + query-vendor ≈ 53KB gzip`。

## 部署

```bash
pnpm build                # 产物在 dist/
# Nginx 直接 serve dist/ 目录,详见 docs/erp-admin/05-deployment.md
```

后端 API 通过 `VITE_API_BASE_URL` 配置,生产环境用 Nginx 反代到 `http://127.0.0.1:3001`。

## 验证

```bash
pnpm build                # 必须 0 error + 生成 dist/stats.html
pnpm lint                 # oxlint 0 warning
pnpm dev                  # 浏览器打开 http://localhost:5173
```

详细设计见项目根目录 `docs/superpowers/plans/2026-06-24-w11-erp-admin.md`。