/**
 * MCP Tool: create_ticket (S8 拆出)
 *
 * 创建客服工单(转发到 erp-admin 后端,持久化到 db)。
 * 返回 backend 工单号和状态。
 *
 * V1 / S6:走 backend POST /api/internal/cs/tickets(api-client.createTicket)
 * V1 / S8:独立成文件,handler 接收 deps 注入(api-client.createTicket)
 */

import { z } from 'zod'
import { isOrderIdSafe } from '../order-helpers'
import type { ToolSpec } from '../registry'

export const createTicketSchema = {
  userIssue: z.string().min(1, 'userIssue 不能为空').max(500).describe('问题描述(1-500 字)'),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal').describe('优先级'),
  relatedOrderId: z
    .string()
    .optional()
    .describe('关联订单号(可选,MCP 阶段先记到 content,不打 backend relatedOrderId)'),
} as const

export type CreateTicketInput = {
  userIssue: string
  priority?: 'low' | 'normal' | 'high'
  relatedOrderId?: string
}

export const createTicketSpec: ToolSpec = {
  name: 'create_ticket',
  description:
    '创建客服工单(转发到 erp-admin 后端,持久化到 db)。返回 backend 工单号和状态。',
  schema: z.object(createTicketSchema),
  category: 'ticket',
  source: 'customer-service',
}

export interface CreateTicketDeps {
  createTicket: (opts: {
    title: string
    content: string
    priority: number
    category: string
    relatedOrderNo?: string
    tenantId: string | null
  }) => Promise<{
    id: number
    ticketNo: string
    status: number
    slaDeadline?: string
  }>
}

const PRIORITY_MAP: Record<string, number> = { low: 3, normal: 2, high: 1 }

export async function executeCreateTicket(
  input: CreateTicketInput,
  deps: CreateTicketDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { userIssue, priority, relatedOrderId } = input
  const trimmed = userIssue.trim()
  if (trimmed.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: 'INVALID_PARAMS', message: 'userIssue 不能为纯空格' },
            null,
            2,
          ),
        },
      ],
    }
  }

  let normalizedOrderId: string | undefined
  if (relatedOrderId) {
    const check = isOrderIdSafe(relatedOrderId)
    if (!check.safe) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { error: 'UNSAFE_INPUT', message: `relatedOrderId ${check.reason}` },
              null,
              2,
            ),
          },
        ],
      }
    }
    normalizedOrderId = check.normalized
  }

  const backendPriority = PRIORITY_MAP[priority ?? 'normal'] ?? 2

  const shortIssue = trimmed.length > 50 ? trimmed.slice(0, 50) + '…' : trimmed
  const titleBase = relatedOrderId ? `[#${normalizedOrderId}] ${shortIssue}` : shortIssue
  const title = titleBase.slice(0, 200)

  const contentBody = relatedOrderId
    ? `${trimmed}\n\n— 关联订单:#${normalizedOrderId}`
    : trimmed

  try {
    const ticket = await deps.createTicket({
      title,
      content: contentBody.slice(0, 5000),
      priority: backendPriority,
      category: 'ai-cs-demo',
      relatedOrderNo: normalizedOrderId,
      tenantId: null,
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ticketId: ticket.ticketNo,
              ticketDbId: ticket.id,
              status: ticket.status === 1 ? 'pending' : `status_${ticket.status}`,
              priority: priority ?? 'normal',
              relatedOrderId: normalizedOrderId,
              slaDeadline: ticket.slaDeadline,
              createdAt: new Date().toISOString(),
              message: '工单已创建(已落库),客服会在 SLA 截止前联系您',
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
              message: `create_ticket 失败(转发到 backend): ${msg}`,
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