/**
 * MCP Tool: search_faq (S8 拆出)
 *
 * 从客服 FAQ 知识库检索相关条目(基于 Chroma collection 的 RAG 检索,
 * collection 名称按 tenantId 隔离,V1 单租户时使用 cs_faq)。
 *
 * 拆出动机(S8):
 *   - 5 工具独立成文件,便于社区贡献者参考 / 加新工具
 *   - 复用 customer-service.ts 的 dynamic import env / api / rag loader 模式
 *
 * 协议:JSON-RPC 2.0 over stdio,通过 McpRegistry 注册 + McpServer.tool() 包装。
 */

import { z } from 'zod'
import type { ToolSpec } from '../registry'

/** MCP tool 输入 schema(ZodRawShape 格式) */
export const searchFaqSchema = {
  query: z.string().min(1, 'query 不能为空').describe('用户问题的关键词,中文友好'),
  topK: z.number().int().min(1).max(10).optional().default(3).describe('返回前 K 条,默认 3'),
  tenantId: z.string().optional().describe('租户 ID(V1 预留,默认 NULL)'),
} as const

/** 解析后的输入类型 */
export type SearchFaqInput = {
  query: string
  topK?: number
  tenantId?: string
}

/** Tool 元信息(注册用) */
export const searchFaqSpec: ToolSpec = {
  name: 'search_faq',
  description:
    '从客服 FAQ 知识库检索相关条目(基于 Chroma collection 的 RAG 检索,collection 名称按 tenantId 隔离,V1 单租户时使用 cs_faq)。',
  schema: z.object(searchFaqSchema),
  category: 'faq',
  source: 'customer-service',
}

/**
 * 工具执行 handler。依赖通过 deps 注入(env / rag module 由 customer-service.ts 持有)。
 *
 * 拆出后的关键约定:不直接 dynamic import src/lib/* — 而是接收已就绪的句柄,
 * 避免在多个工具文件里重复 import 同一份模块带来的副作用(rag 实例 / env cache)。
 */
export interface SearchFaqDeps {
  /** 已准备好的 rag module(由 customer-service.ts dynamic import 后传入) */
  search: (query: string, topK?: number) => Promise<Array<{ chunk: { text: string; source: string; index: number }; score: number }>>
  getStoreSize: () => Promise<number>
  /** env module 的 getChromaCollectionForTenant(tenant-aware collection 解析) */
  getChromaCollectionForTenant: (tenantId: string | null) => string
}

export async function executeSearchFaq(
  input: SearchFaqInput,
  deps: SearchFaqDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { query, topK, tenantId } = input
  try {
    const collection = deps.getChromaCollectionForTenant(tenantId ?? null)
    const size = await deps.getStoreSize()
    if (size === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results: [], total: 0, message: 'FAQ 库为空' }, null, 2),
          },
        ],
      }
    }
    const hits = await deps.search(query, topK)
    const results = hits.map((h) => ({
      text: h.chunk.text,
      source: h.chunk.source,
      score: h.score,
      chunkIndex: h.chunk.index,
    }))
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              results,
              total: results.length,
              collection,
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'INTERNAL',
              message: `search_faq 失败: ${msg}`,
              retryable: true,
            },
            null,
            2,
          ),
        },
      ],
    }
  }
}