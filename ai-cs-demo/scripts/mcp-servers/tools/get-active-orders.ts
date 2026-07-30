/**
 * MCP Tool: get_active_orders (S8 拆出)
 *
 * 查询当前用户所有进行中的订单(已付款 / 已发货 / 等待出库 / 退款中)。
 * 从 erp-admin backend 查;不再用 mock 数据。
 */

import { z } from 'zod'
import type { ToolSpec } from '../registry'
import type { BackendOrderShape, McpOrderShape } from '../order-helpers'

export const getActiveOrdersSchema = {
  // sessionKey 由 chat route wrap 注入;直接调 MCP(JSON-RPC)也能传过 Zod 不被剥离
  // 不暴露 userId — 防止 LLM/前端构造 IDOR
  sessionKey: z.string().optional().describe('会话键(由 chat route 自动注入;直接调用时必传)'),
} as const

export type GetActiveOrdersInput = { sessionKey?: string } // chat route 在 wrap 注入;execute 强校验非空

export const getActiveOrdersSpec: ToolSpec = {
  name: 'get_active_orders',
  description:
    '查询当前用户所有进行中的订单(已付款 / 已发货 / 等待出库 / 退款中)。从 erp-admin backend 查;不再用 mock 数据。',
  schema: z.object(getActiveOrdersSchema),
  category: 'order',
  source: 'customer-service',
}

export interface GetActiveOrdersDeps {
  listActiveOrders: (opts: {
    sessionKey: string
    status: string
    tenantId: string | null
  }) => Promise<unknown[]>
  backendOrderToMcp: (bo: BackendOrderShape) => McpOrderShape
}

export async function executeGetActiveOrders(
  input: GetActiveOrdersInput,
  deps: GetActiveOrdersDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { sessionKey } = input
  try {
    if (!sessionKey || typeof sessionKey !== 'string' || !sessionKey.trim()) {
      throw new Error('sessionKey 缺失 — 直调 MCP 时必传;通过 chat route 调时由 wrap 注入')
    }
    const orders = await deps.listActiveOrders({
      sessionKey: sessionKey.trim(),
      status: 'all',
      tenantId: null,
    })
    const ACTIVE_LABELS = new Set(['已付款', '已发货', '等待出库', '退款中'])
    const active = orders
      .map((o) => deps.backendOrderToMcp(o as BackendOrderShape))
      .filter((o) => ACTIVE_LABELS.has(o.status))
      .map((o) => ({
        id: `#${o.id}`,
        status: o.status,
        createdAt: o.createdAt,
        total: o.total,
        trackingNumber: o.trackingNumber,
        shippingStatus: o.shippingStatus,
        items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      }))
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              orders: active,
              count: active.length,
              sessionKey: sessionKey.trim().slice(0, 12) + '…',
              message:
                active.length === 0
                  ? '您当前没有进行中的订单'
                  : `共 ${active.length} 个进行中的订单`,
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
              message: `get_active_orders 失败: ${msg}`,
              retryable: true,
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