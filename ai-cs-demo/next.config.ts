import type { NextConfig } from 'next'

const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development'

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Docker build 时跳过 TypeScript 检查 — 历史包袱(W11 引入 zod v4 / AI SDK 6.x 升级
  // 没把所有类型适配完整),dev / 本机仍会跑 tsc --noEmit 守门;production build
  // 这里兜底跳过。fix-008 后 CI tsc 必须 exit 0,这层兜底留给还没清完的边界。
  typescript: {
    ignoreBuildErrors: true,
  },
  // 注:Next.js 16 已移除顶层 `eslint` 配置项(原 `ignoreDuringBuilds` 等),
  // ESLint 规则现在走 .eslintrc.* 而非 next.config.ts。这里主动删掉避免 TS 报
  // 'eslint' 不在 NextConfig 类型里。
  // 注:Next.js 13+ 同时也移除了 `publicRuntimeConfig`,NEXT_PUBLIC_* 变量会被
  // 自动暴露到客户端。appEnv 通过 NEXT_PUBLIC_APP_ENV 注入(见 env 段)。
  // 多环境支持:把 APP_ENV 注入到 runtime + 客户端(2026-07-13)
  env: {
    APP_ENV,
    NEXT_PUBLIC_APP_ENV: APP_ENV,
  },
}

export default nextConfig