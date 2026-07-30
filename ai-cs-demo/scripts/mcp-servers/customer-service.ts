/**
 * MCP Server: customer-service (V1 / S8 重构)
 *
 * V1 改造时间线:
 *   - S6(2026-07-16):5 工具切真实 backend API
 *   - S8(2026-07-16):5 工具拆到 tools/*.ts,统一通过 McpRegistry 注册,
 *     并暴露 __list_tools 元工具;plugin 热加载不做,只启动时注册
 *
 * 5 工具:
 *   - search_faq        检索 FAQ 知识库(Chroma cs_faq collection;tenant-aware)
 *   - get_user_order    查 backend Order 表(W9-10 mock-orders.json 已删)
 *   - get_active_orders 查 backend 用户的进行中订单
 *   - create_ticket     POST /api/internal/cs/tickets
 *   - escalate_to_human POST /api/internal/cs/escalations
 *   - __list_tools      元工具:返回所有可用工具清单(给 AI 看)
 *
 * 协议:JSON-RPC 2.0 over stdio。
 *
 * 安全:
 *   - get_user_order 的 orderId 走 isOrderIdSafe() 白名单(只允许 # + 数字,长度 ≤ 20)
 *   - 所有 backend 调用通过 src/lib/api-client.ts,统一带 X-Internal-Token
 *   - 工具返回统一结构,错误用 isError: true + 结构化 JSON 字符串(便于 AI 解析)
 *
 * V1 单租户:tenantId 全程为 null,代码层预留。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CUSTOMER_SERVICE_TOOL_SPECS,
  CUSTOMER_SERVICE_TOOL_HANDLERS,
} from './tools'
import { getRegistry } from './registry'

// ============ 路径常量 ============

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// server 在 scripts/mcp-servers/ 下,project root 是上两级
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const ENV_LOCAL_PATH = resolve(PROJECT_ROOT, '.env.local')

console.error(`[cs-mcp] V1 project root: ${PROJECT_ROOT}`)

// ============ 简易 .env loader ============
// tsx 跑 scripts 不自动加载 .env 文件(只有 Next.js dev 才加载)。
// 客服 server 需要 CHROMA_URL / CHROMA_COLLECTION / DASHSCOPE_API_KEY,
// 手写一个 minimal loader —— 只在 key 还没设置时才填,避免覆盖系统 env。
//
// 多环境改造(沿用 W9-10 2026-07-13):
//   - 优先按 APP_ENV 加载对应 .env.{development|test|uat|production}
//   - 兼容老的 .env.local(本地 dev 兜底)
//   - 都缺就跳过(假设容器里 compose 已注入 env)
function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = val
    }
  }
}

const _appEnv = process.env.APP_ENV || 'development'
loadEnvFile(resolve(PROJECT_ROOT, `.env.${_appEnv}`))
loadEnvFile(ENV_LOCAL_PATH)

// ============ dynamic imports(env.ts / api-client.ts / rag.ts) ============
// 用 dynamic import + .then() 兼容 tsx 的 CJS 模式(不支持 top-level await)。
// 原因:env.ts 启动即 safeParse,必须等 .env loader 跑完才能 import。
let _env: typeof import('../../src/lib/env')['env'] | null = null
let _getChromaCollectionForTenant:
  typeof import('../../src/lib/env')['getChromaCollectionForTenant'] | null = null
async function ensureEnvImports() {
  if (!_env) {
    const mod = await import('../../src/lib/env')
    _env = mod.env
    _getChromaCollectionForTenant = mod.getChromaCollectionForTenant
  }
}

let _api: typeof import('../../src/lib/api-client') | null = null
async function ensureApiImports() {
  if (!_api) {
    _api = await import('../../src/lib/api-client')
  }
}

let _searchDocs: typeof import('../../src/lib/rag')['search'] | null = null
let _getStoreSize: typeof import('../../src/lib/rag')['getStoreSize'] | null = null
async function ensureRagImports() {
  if (!_searchDocs) {
    const mod = await import('../../src/lib/rag')
    _searchDocs = mod.search
    _getStoreSize = mod.getStoreSize
  }
}

// ============ Tool handler 序列化锁 ============
// stdio transport 一口气读出 N 条消息会并发触发 tool handler,
// 加 promise 链确保一个 handler 跑完才执行下一个(JSON-RPC 顺序保证)。
let toolChain: Promise<unknown> = Promise.resolve()
function serializedTool<T>(fn: () => Promise<T>): Promise<T> {
  const next = toolChain.then(fn, fn)
  toolChain = next.catch(() => {})
  return next
}

// ============ Server ============

const server = new McpServer(
  {
    name: 'customer-service',
    version: '1.1.0',  // V1.1 — McpRegistry + 多 server 支持(S8)
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// ============ 通过 McpRegistry 注册 + McpServer 注入 handler ============
// S8 模式:
//   1) tools/*.ts 提供 spec(name/desc/schema/category/source) + pure handler(input, deps)
//   2) customer-service.ts 持有 deps 句柄(env / api / rag),注入到 handler
//   3) McpServer.tool() 接 handler(走 JSON-RPC 协议)
//   4) McpRegistry.register() 接 spec(只存元信息,用于 __list_tools 元工具)

const registry = getRegistry()

// 先 lazy load order-helpers 用于 backendOrderToMcp
let _backendOrderToMcp: typeof import('./order-helpers')['backendOrderToMcp'] | null = null
async function ensureOrderHelpers() {
  if (!_backendOrderToMcp) {
    const mod = await import('./order-helpers')
    _backendOrderToMcp = mod.backendOrderToMcp
  }
}

for (const spec of CUSTOMER_SERVICE_TOOL_SPECS) {
  // 1) 注册到 McpRegistry(纯元信息,用于 __list_tools)
  registry.register({ ...spec })

  // 2) 注册到 McpServer(JSON-RPC 入口 + handler 注入 deps)
  const handlerKey = spec.name as keyof typeof CUSTOMER_SERVICE_TOOL_HANDLERS
  const handler = CUSTOMER_SERVICE_TOOL_HANDLERS[handlerKey]
  if (!handler) {
    throw new Error(`[cs-mcp] No handler for tool '${spec.name}'`)
  }

  // McpServer.tool() 需要 ZodRawShape 格式(spec.schema 是 z.object(...)).
  // ZodRawShape = z.object 的字段定义 object,我们用 .shape 拿字段定义。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaShape = (spec.schema as any).shape as Record<string, unknown>

  server.tool(
    spec.name,
    spec.description,
    schemaShape,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (args: any) =>
      serializedTool(async () => {
        try {
          switch (spec.name) {
            case 'search_faq': {
              await ensureRagImports()
              await ensureEnvImports()
              return await handler(args, {
                search: _searchDocs!,
                getStoreSize: _getStoreSize!,
                getChromaCollectionForTenant: _getChromaCollectionForTenant!,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
            case 'get_user_order': {
              await ensureApiImports()
              await ensureOrderHelpers()
              return await handler(args, {
                getOrderByOrderNo: _api!.getOrderByOrderNo.bind(_api!),
                backendOrderToMcp: _backendOrderToMcp!,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
            case 'get_active_orders': {
              // W11 C-FULL:handler signature 变为 (input, { listActiveOrders({sessionKey, status, tenantId}) })
              // sessionKey 在 chat route 的 wrap 处注入,handler 内部不再校验 userId
              await ensureApiImports()
              await ensureOrderHelpers()
              return await handler(args, {
                listActiveOrders: _api!.listActiveOrders.bind(_api!),
                backendOrderToMcp: _backendOrderToMcp!,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
            case 'create_ticket': {
              await ensureApiImports()
              return await handler(args, {
                createTicket: _api!.createTicket.bind(_api!),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
            case 'escalate_to_human': {
              await ensureApiImports()
              return await handler(args, {
                createEscalation: _api!.createEscalation.bind(_api!),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
            default: {
              throw new Error(`[cs-mcp] Unknown tool in registry dispatch: '${spec.name}'`)
            }
          }
        } catch (err) {
          // handler 内部已经返回 isError: true 的结构,这里 catch 兜底
          const message = err instanceof Error ? err.message : String(err)
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: 'INTERNAL',
                    message: `${spec.name} dispatch 失败: ${message}`,
                    retryable: true,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }
      }),
  )
}

// ============ 元工具 __list_tools(S8) ============
// 给 AI 看的工具清单 — AI 调用 __list_tools 可以动态查看所有可用工具的
// name / description / category(便于在多工具环境下不依赖 system prompt)。
const metaSpec = registry.exposeListToolsMeta()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metaSchemaShape = (metaSpec.schema as any).shape as Record<string, unknown>
server.tool(
  metaSpec.name,
  metaSpec.description,
  metaSchemaShape,
  () =>
    serializedTool(async () => {
      const data = registry.handleListTools()
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      }
    }),
)

// ============ 启动 ============

;(async () => {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `[cs-mcp] V1 connected, ${registry.size()} tools registered (incl. __list_tools), waiting for JSON-RPC messages on stdin`,
  )
})().catch((err) => {
  console.error('[cs-mcp] fatal:', err)
  process.exit(1)
})