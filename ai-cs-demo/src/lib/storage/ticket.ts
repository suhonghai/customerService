import { getErpAdminClient, type TicketInfo } from '../erp-admin-client'

/**
 * 工单存储抽象(Day 9)
 *
 * 原架构:`scripts/mcp-servers/customer-service.ts` 里的 create_ticket /
 *         escalate_to_human 用内存 Map,重启清空
 *
 * 新架构:调 erp-admin internal API 创建真实工单
 *   失败抛(工单创建是关键业务,失败要让 AI 知道)
 */

export interface CreateTicketInput {
  title: string;
  content: string;
  priority?: number; // 1 高 / 2 中 / 3 低
  category?: string;
  sessionId?: number;
  relatedOrderId?: number;
}

/**
 * priority string(low/normal/high) → erp-admin 数字(1/2/3)
 */
export function normalizePriority(
  p: 'low' | 'normal' | 'high' | undefined,
): number | undefined {
  if (!p) return undefined;
  if (p === 'high') return 1;
  if (p === 'normal') return 2;
  if (p === 'low') return 3;
  return undefined;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<TicketInfo> {
  return getErpAdminClient().createTicket(input);
}
