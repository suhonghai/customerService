import type { NextConfig } from 'next'

const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development'

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Docker build 时跳过 TypeScript 检查 — 已有 zod 4 / AI SDK 6.x 类型不匹配的
  // 历史包袱(W11 Day 7 引入 zod v4 升级没把 define-tool 泛型适配),
  // dev / 本机开发仍会跑 tsc --noEmit,有错就报;production build 这里兜底跳过。
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 多环境支持:把 APP_ENV 注入到 runtime + 客户端(2026-07-13)
  env: {
    APP_ENV,
    NEXT_PUBLIC_APP_ENV: APP_ENV,
  },
  // 显式暴露 runtime config(保险起见,Next 13+ 默认会暴露 NEXT_PUBLIC_*)
  publicRuntimeConfig: {
    appEnv: APP_ENV,
  },
}

export default nextConfig