/**
 * Customer Service MCP — 5 工具统一导出 (S8)
 *
 * 加新工具流程(社区贡献者):
 *   1) 在 tools/ 下新建 <my-tool>.ts,导出:
 *      - <my-tool>Schema:ZodRawShape 格式
 *      - <my-tool>Spec:ToolSpec
 *      - execute<MyTool>(input, deps):handler
 *   2) 在下面数组里加上 spec(自动纳入 registry + McpServer)
 *   3) customer-service.ts 里把执行所需的 deps 注入到对应 handler
 *
 * 不需要改 McpRegistry / mcp-client / Agent 主流程。
 *
 * V1 5 工具:
 *   - search_faq         FAQ RAG 检索(Chroma,tenant-aware)
 *   - get_user_order     查单个订单(backend Order 表)
 *   - get_active_orders  查用户所有进行中订单
 *   - create_ticket      创建工单(POST backend)
 *   - escalate_to_human  转人工(POST backend,category=escalation)
 *
 * 元工具 __list_tools 由 registry 暴露,不列在此处。
 */

import type { ToolSpec } from '../registry'
import { searchFaqSpec, executeSearchFaq } from './search-faq'
import { getUserOrderSpec, executeGetUserOrder } from './get-user-order'
import { getActiveOrdersSpec, executeGetActiveOrders } from './get-active-orders'
import { createTicketSpec, executeCreateTicket } from './create-ticket'
import { escalateToHumanSpec, executeEscalateToHuman } from './escalate-to-human'

/** 5 工具 spec 列表 — customer-service.ts 用此数组注册到 McpServer + registry */
export const CUSTOMER_SERVICE_TOOL_SPECS: ToolSpec[] = [
  searchFaqSpec,
  getUserOrderSpec,
  getActiveOrdersSpec,
  createTicketSpec,
  escalateToHumanSpec,
] as const

/** 5 工具 spec 按 name 索引的 map(便于 customer-service.ts 查找 handler) */
export const CUSTOMER_SERVICE_TOOL_HANDLERS = {
  search_faq: executeSearchFaq,
  get_user_order: executeGetUserOrder,
  get_active_orders: executeGetActiveOrders,
  create_ticket: executeCreateTicket,
  escalate_to_human: executeEscalateToHuman,
} as const

export {
  searchFaqSpec,
  executeSearchFaq,
  getUserOrderSpec,
  executeGetUserOrder,
  getActiveOrdersSpec,
  executeGetActiveOrders,
  createTicketSpec,
  executeCreateTicket,
  escalateToHumanSpec,
  executeEscalateToHuman,
}

export type { SearchFaqDeps } from './search-faq'
export type { GetUserOrderDeps } from './get-user-order'
export type { GetActiveOrdersDeps } from './get-active-orders'
export type { CreateTicketDeps } from './create-ticket'
export type { EscalateToHumanDeps } from './escalate-to-human'