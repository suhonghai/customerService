/**
 * MCP Tool: escalate_to_human (S8 拆出)
 *
 * 转人工客服(转给 erp-admin 后端,持久化到 cs_ticket 表,category=escalation)。
 * 返回 backend 工单号和 SLA。
 */

import { z } from 'zod'
import type { ToolSpec } from '../registry'

export const escalateToHumanSchema = {
  reason: z.string().min(1, 'reason 不能为空').max(200).describe('转人工原因(1-200 字)'),
  urgency: z.enum(['normal', 'urgent']).optional().default('normal').describe('紧急程度'),
  sessionKey: z
    .string()
    .optional()
    .describe('(运行时注入) — frontend 会自动补,不需 LLM 传'),
  userId: z.string().optional().describe('用户 ID(可选,默认 anonymous)'),
} as const

export type EscalateToHumanInput = {
  reason: string
  urgency?: 'normal' | 'urgent'
  sessionKey?: string
  userId?: string
}

export const escalateToHumanSpec: ToolSpec = {
  name: 'escalate_to_human',
  description:
    '转人工客服(转给 erp-admin 后端,持久化到 cs_ticket 表,category=escalation)。返回 backend 工单号和 SLA。',
  schema: z.object(escalateToHumanSchema),
  category: 'escalation',
  source: 'customer-service',
}

export interface EscalateToHumanDeps {
  createEscalation: (opts: {
    subject: string
    content: string
    priority: number
    sessionKey?: string
    userId?: string
    tenantId: string | null
  }) => Promise<{
    ticketId: number
    ticketNo: string
    category: string
    slaDeadline?: string
  }>
}

const PRIORITY_MAP: Record<string, number> = { normal: 2, urgent: 1 }

export async function executeEscalateToHuman(
  input: EscalateToHumanInput,
  deps: EscalateToHumanDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { reason, urgency, sessionKey, userId } = input
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: 'INVALID_PARAMS', message: 'reason 不能为纯空格' },
            null,
            2,
          ),
        },
      ],
    }
  }

  const backendPriority = PRIORITY_MAP[urgency ?? 'normal'] ?? 2

  const subject = `[转人工] ${trimmed}`.slice(0, 200)
  const content = trimmed.length > 10
    ? trimmed
    : `${trimmed}\n\n(客户描述较简,建议客服主动回拨确认)`

  try {
    const esc = await deps.createEscalation({
      subject,
      content: content.slice(0, 5000),
      priority: backendPriority,
      sessionKey,
      userId,
      tenantId: null,
    })

    const estUrgency = urgency ?? 'normal'
    const response: Record<string, unknown> = {
      ticketNo: esc.ticketNo,
      escalationId: esc.ticketNo,
      ticketDbId: esc.ticketId,
      category: esc.category,
      priority: backendPriority === 1 ? 'high' : 'normal',
      urgency: estUrgency,
      estimatedWaitMinutes: estUrgency === 'urgent' ? 5 : 15,
      slaDeadline: esc.slaDeadline,
      status: 'pending',
      createdAt: new Date().toISOString(),
      message: '已转人工客服,请稍候(工单已落库,运营可在 admin 后台领取)',
    }
    if (trimmed.length < 10) {
      response.warning = '建议详细描述问题以便客服更快处理'
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
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
              message: `escalate_to_human 失败(转发到 backend): ${msg}`,
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