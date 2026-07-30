/**
 * order-helpers — MCP server 共用工具(S6)
 *
 * 把 customer-service.ts 里需要单测覆盖的纯函数抽出来:
 *   - isOrderIdSafe:订单号白名单(防 #../../etc/passwd 类注入)
 *   - backendPayStatusToLabel:backend 数字状态 → MCP 语义化字符串
 *   - backendOrderToMcp:backend Order 对象 → MCP 返回结构
 *
 * 这样可以在不启动 MCP 子进程的情况下单测覆盖。
 */

/**
 * 防 #../../etc/passwd 类输入:只允许 #? + 数字,长度 ≤ 20
 *
 * @returns { safe, reason?, normalized? } — safe=true 时 normalized 是去掉 # 的 3 位字符串
 */
export function isOrderIdSafe(orderId: string): { safe: boolean; reason?: string; normalized?: string } {
  if (!orderId) return { safe: false, reason: '订单号不能为空' }
  if (orderId.length > 20) return { safe: false, reason: `订单号过长(>20): ${orderId.length}` }
  if (!/^#?\d{3,}$/.test(orderId)) {
    return { safe: false, reason: `订单号格式错误,应为 # + 3 位以上数字: ${orderId}` }
  }
  if (/[\s/\\\0]/.test(orderId)) {
    return { safe: false, reason: '订单号含非法字符' }
  }
  const normalized = orderId.replace(/^#/, '').padStart(3, '0')
  return { safe: true, normalized }
}

/**
 * backend payStatus (1=未支付 / 2=已支付 / 3=退款中) + orderStatus (1=待发货 / 2=已发货 / 3=已签收 / 4=已取消)
 * → MCP 语义化字符串(已付款 / 已发货 / 等待出库 / 退款中 / 已签收 / 已取消)
 *
 * V1 决策(S6):保留 W9-10 的 string 状态集,集中改一处。
 */
export function backendPayStatusToLabel(payStatus: number, orderStatus: number): string {
  if (payStatus === 3) return '退款中'
  if (orderStatus === 1) return payStatus === 2 ? '已付款' : '等待出库'
  if (orderStatus === 2) return '已发货'
  if (orderStatus === 3) return '已签收'
  if (orderStatus === 4) return '已取消'
  return '未知'
}

/**
 * backend Order → MCP 订单结构(给 AI 看的)
 */
export interface BackendOrderShape {
  id: number
  orderNo: string
  customerName: string
  totalAmount: string
  payAmount: string
  payStatus: number
  orderStatus: number
  shipNo: string | null
  shipCompany: string | null
  items: Array<{
    id: number
    productId: string
    productName: string
    price: string
    quantity: number
    subtotal: string
  }>
  createdAt: string
}

export interface McpOrderShape {
  id: string
  status: string
  createdAt: string
  items: Array<{ name: string; productId: string; qty: number; price: number }>
  total: number
  trackingNumber: string | null
  shippingStatus: string | null
}

export function backendOrderToMcp(bo: BackendOrderShape): McpOrderShape {
  // shippingStatus 优先 shipCompany + shipNo 组合,无 shipCompany 但有 shipNo 时退化
  let shippingStatus: string | null = null
  if (bo.shipCompany && bo.shipNo) {
    shippingStatus = `${bo.shipCompany} ${bo.shipNo}`
  } else if (bo.shipNo) {
    shippingStatus = bo.shipNo
  }

  return {
    id: bo.orderNo,
    status: backendPayStatusToLabel(bo.payStatus, bo.orderStatus),
    createdAt: bo.createdAt,
    items: bo.items.map((i) => ({
      name: i.productName,
      productId: i.productId,
      qty: i.quantity,
      price: Number(i.price),
    })),
    total: Number(bo.totalAmount),
    trackingNumber: bo.shipNo,
    shippingStatus,
  }
}