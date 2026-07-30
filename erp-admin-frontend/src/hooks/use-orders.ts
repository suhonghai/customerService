import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import dayjs from 'dayjs';
import {
  listOrders,
  getOrder,
  updateStatus,
  refund,
  exportOrdersUrl,
  type OrderListItem,
  type OrderItem,
  type UpdateOrderStatusDto,
  type RefundDto,
} from '@/services/order';
import { useAuthStore } from '@/stores/auth';

export interface OrderListResult {
  list: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Order page 的 query / mutation 封装。
 *
 * - `useOrderList(params)` — 拉列表(基于 queryKey 自动缓存 + 重取)
 * - `useOrderDetail(id)` — 拉单个订单详情(包含 items)
 * - `useUpdateStatus()` — 修改订单状态 mutation(成功 toast + 失效 orders 查询)
 * - `useRefundOrder()` — 退款 mutation(成功 toast + 失效 orders 查询)
 * - `exportOrders(params, token)` — 拉 CSV(浏览器侧导出,不走 axios)
 */
export function useOrderList(params: Record<string, unknown>) {
  return useQuery<OrderListResult>({
    queryKey: ['orders', params],
    queryFn: () => listOrders(params as any),
  });
}

export function useOrderDetail(id: number | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id as number),
    enabled: id !== null,
    staleTime: 60_000,
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateOrderStatusDto }) => updateStatus(id, dto),
    onSuccess: () => {
      message.success('状态已更新');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}

export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: RefundDto }) => refund(id, dto),
    onSuccess: () => {
      message.success('退款已发起');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}

export interface ExportOutcome {
  ok: boolean;
  message?: string;
}

/**
 * 浏览器侧 CSV 导出 — 拿到 accessToken 后 fetch → blob → a.click 下载。
 * 返回 ok/err 字符串给调用方 toast;无 token 时直接 ok=false + 提示。
 */
export async function exportOrdersToCsv(
  params: Record<string, unknown>,
  token: string | null,
): Promise<ExportOutcome> {
  if (!token) return { ok: false, message: '未登录,无法导出' };
  try {
    const res = await fetch(exportOrdersUrl(params as any), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || '导出失败' };
  }
}

/**
 * 包装一下把 useAuthStore 也带进来 — UI 侧只调一个。
 * 拆出来主要是为了让 page.tsx 测试时 mock 容易。
 */
export function useExportOrders(params: Record<string, unknown>) {
  const token = useAuthStore((s) => s.accessToken);
  return async () => exportOrdersToCsv(params, token);
}

// Re-export so consumers don't have to dig into services/order.ts
export type { OrderListItem, OrderItem, UpdateOrderStatusDto, RefundDto };
