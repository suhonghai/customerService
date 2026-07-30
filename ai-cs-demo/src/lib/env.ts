/**
 * env — V1 ai-cs-demo 多环境配置中心
 *
 * 4 套环境:
 *   - development(local dev,本地 chroma + 本地 backend)
 *   - test      (vitest,独立 collection / port)
 *   - uat       (docker compose overlay,容器化集成验证)
 *   - production(docker compose overlay,生产部署)
 *
 * 设计:
 *   - 启动即校验(zod safeParse),缺关键变量启动失败
 *   - 解析一次,全局复用(后续 import 都是同一份 env 对象)
 *   - 不暴露 raw process.env,统一走 helpers(避免散落 process.env.X)
 *
 * V1 与 W9-10 差异(2026-07-16,S6):
 *   - 端口 9529(V1 专属,W9-10 用 9528)
 *   - CHROMA_COLLECTION 默认 `cs_faq`(W9-10 用 `erp_faq`)
 *   - ERP_ADMIN 默认 URL http://127.0.0.1:3001(V1 backend 端口,W9-10 也是 3001 但 V1 强制)
 *   - 不引入 W9-10 的 WEATHER_API_KEY / MCP_ALLOWED_ROOTS(V1 不需要)
 */

import { z } from 'zod'

const envSchema = z.object({
  APP_ENV: z
    .enum(['development', 'test', 'uat', 'production'])
    .default('development'),
  NODE_ENV: z.string().default('development'),

  // AI provider(由 erp-admin 主动注入 active cfg,V1 ai-cs-demo 只作为兜底)
  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_BASE_URL: z.string().url().optional(),
  CHAT_MODEL: z.string().default('qwen3-max'),
  EMBED_MODEL: z.string().default('text-embedding-v4'),

  // Chroma
  CHROMA_URL: z.string().url().default('http://127.0.0.1:8001'),
  CHROMA_HOST: z.string().optional(),
  CHROMA_PORT: z.coerce.number().optional(),
  // V1 默认 cs_faq;多租户场景会变成 `cs_faq_${tenantId || 'default'}`(S6 预留)
  CHROMA_COLLECTION: z.string().default('cs_faq'),
  CHROMA_PERSIST_DIR: z.string().default('./chroma-data-cs'),

  // ERP Admin Backend(V1 端口 3001)
  ERP_ADMIN_URL: z.string().url().default('http://127.0.0.1:3001'),
  ERP_ADMIN_TOKEN: z.string().optional(),
  ERP_ADMIN_INTERNAL_TOKEN: z.string().optional(),
  INTERNAL_TOKEN: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(9529),

  // Debug
  NEXT_PUBLIC_DEBUG_TRACE: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_DEBUG_RETRIEVAL: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_TOP_K: z.coerce.number().default(3),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  )
  throw new Error('Invalid environment variables')
}

export const env = parsed.data

// helpers
export const isDev = env.APP_ENV === 'development'
export const isProd = env.APP_ENV === 'production'
export const isTest = env.APP_ENV === 'test'
export const isUat = env.APP_ENV === 'uat'

/**
 * resolve ERP admin token
 *
 * 优先级:ERP_ADMIN_TOKEN > ERP_ADMIN_INTERNAL_TOKEN > INTERNAL_TOKEN
 *
 * V1 容器化(docker-compose.v1.yml)用 INTERNAL_TOKEN;
 * 本地开发(.env.development)用 ERP_ADMIN_TOKEN。
 */
export function getErpAdminToken(): string {
  return (
    env.ERP_ADMIN_TOKEN || env.ERP_ADMIN_INTERNAL_TOKEN || env.INTERNAL_TOKEN || ''
  )
}

/**
 * resolve chroma URL
 *
 * 优先用 CHROMA_HOST + CHROMA_PORT(容器化场景),回退 CHROMA_URL(本地 dev)。
 */
export function getChromaUrl(): string {
  if (env.CHROMA_HOST && env.CHROMA_PORT) {
    return `http://${env.CHROMA_HOST}:${env.CHROMA_PORT}`
  }
  return env.CHROMA_URL
}

/**
 * resolve chroma collection name(tenant-aware)
 *
 * V1 单租户 → 默认 `cs_faq`(无 tenantId 占位)
 * V1.1+ 多租户 → `cs_faq_${tenantId || 'default'}`
 *
 * 注意:env.CHROMA_COLLECTION 是全局兜底;若上层(mcp-client)想按 tenant
 * 切换,直接传 collection 参数到 rag.search() 即可。
 *
 * 2026-07-16 S6 决策:tenant_id 全部表预留默认 NULL,这里 collection name 也
 * 加 tenantId 占位符,虽然 V1 默认是 NULL,但代码层预留多租户扩展点。
 */
export function getChromaCollectionForTenant(tenantId: number | string | null | undefined): string {
  if (tenantId === null || tenantId === undefined || tenantId === '') {
    // V1 单租户场景:用 env 兜底
    return env.CHROMA_COLLECTION
  }
  return `${env.CHROMA_COLLECTION}_${tenantId}`
}