/**
 * MCP Tool: get_user_order (S8 拆出)
 *
 * 查订单信息(从 erp-admin backend Order 表查,V1 真实数据;不再用 mock 数据)。
 * orderId 接受 #xxx 或 xxx 格式。
 *
 * 拆出动机(S8):见 tools/search-faq.ts 同节注释。
 */

import { z } from 'zod'
import { isOrderIdSafe } from '../order-helpers'
import type { BackendOrderShape, McpOrderShape } from '../order-helpers'
import type { ToolSpec } from '../registry'

export const getUserOrderSchema = {
  orderId: z.string().min(1).describe('订单号,如 #001 / 001'),
} as const

export type GetUserOrderInput = { orderId: string }

export const getUserOrderSpec: ToolSpec = {
  name: 'get_user_order',
  description:
    '查订单信息(从 erp-admin backend Order 表查,V1 真实数据;不再用 mock 数据)。orderId 接受 #xxx 或 xxx 格式。',
  schema: z.object(getUserOrderSchema),
  category: 'order',
  source: 'customer-service',
}

export interface GetUserOrderDeps {
  /** api-client 的 getOrderByOrderNo */
  getOrderByOrderNo: (orderNo: string, opts: { tenantId: string | null }) => Promise<unknown>
  /** order-helpers 的 backendOrderToMcp */
  backendOrderToMcp: (bo: BackendOrderShape) => McpOrderShape
}

export async function executeGetUserOrder(
  input: GetUserOrderInput,
  deps: GetUserOrderDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { orderId } = input
  const check = isOrderIdSafe(orderId)
  if (!check.safe) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'UNSAFE_INPUT', message: check.reason }, null, 2),
        },
      ],
    }
  }
  try {
    const order = await deps.getOrderByOrderNo(check.normalized!, { tenantId: null })
    if (!order) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { error: 'NOT_FOUND', message: `订单号 #${check.normalized} 不存在` },
              null,
              2,
            ),
          },
        ],
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ order: deps.backendOrderToMcp(order as BackendOrderShape) }, null, 2),
        },
      ],
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? err.code
        : undefined
    const isNotFound = code === 404 || code === 1404
    const msg = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: isNotFound ? 'NOT_FOUND' : 'INTERNAL',
              message: `get_user_order 失败: ${msg}`,
              retryable: !isNotFound,
              hint: '检查 ERP_ADMIN_URL / INTERNAL_TOKEN 是否配置,backend 是否可达',
            },
            null,
            2,
          ),
        },
      ],
    }
  }
}