import { getErpAdminClient, type OrderInfo } from '../erp-admin-client';
import { isTest } from '../env';

/**
 * 订单存储抽象(Day 9)
 *
 * 原架构:`scripts/mcp-servers/customer-service.ts` 里的 get_user_order
 *   读 data/mock-orders.json(5 个 mock 订单)
 *
 * 新架构:调 erp-admin internal API 查真实订单
 *   失败 → 兜底回 mock(开发体验保留)
 */

let _mockOrdersCache: OrderInfo[] | null = null;

async function loadMockOrders(): Promise<OrderInfo[]> {
  if (_mockOrdersCache) return _mockOrdersCache;
  // 动态 import(避免启动时强依赖)
  const path = await import('node:path');
  const url = await import('node:url');
  const fs = await import('node:fs/promises');
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // src/lib/storage/order.ts → ../../../data/mock-orders.json
  const mockPath = path.resolve(__dirname, '..', '..', '..', 'data', 'mock-orders.json');
  try {
    const raw = await fs.readFile(mockPath, 'utf8');
    _mockOrdersCache = JSON.parse(raw) as OrderInfo[];
  } catch {
    _mockOrdersCache = [];
  }
  return _mockOrdersCache;
}

export interface FindOrderInput {
  orderId: string;
}

/**
 * 标准化 orderId
 * 接受 #001 / 001 / ORD-XXX → ORD-XXX
 */
export function normalizeOrderId(orderId: string): string {
  const trimmed = orderId.trim().replace(/^#/, '');
  if (trimmed.startsWith('ORD-')) return trimmed;
  return `ORD-${trimmed.padStart(3, '0')}`;
}

/**
 * 查订单(走 erp-admin),失败兜底 mock
 */
export async function findOrder(input: FindOrderInput): Promise<OrderInfo | null> {
  const orderNo = normalizeOrderId(input.orderId);
  try {
    const order = await getErpAdminClient().findOrderByNo(orderNo);
    return order;
  } catch (e) {
    if (!isTest) {
      console.warn(`[storage/order] erp-admin 查订单失败,降级 mock: ${(e as Error).message}`);
    }
    const mocks = await loadMockOrders();
    // mock-orders.json 用 {id: string} ("001"), OrderInfo.id 是 number — 不同源
    // 用 typed cast 保留原 fallback 语义 (允许 string id 命中)
    const found = mocks.find(
      (o) => o.orderNo === orderNo || (o as unknown as { id?: string }).id === orderNo,
    );
    return found ?? null;
  }
}
