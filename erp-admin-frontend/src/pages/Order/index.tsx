import { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  OrderFilters,
  toListParams,
  type OrderFiltersValue,
} from '@/components/order/OrderFilters';
import { OrderTable } from '@/components/order/OrderTable';
import { OrderDetailModal } from '@/components/order/OrderDetailModal';
import { StatusModal } from '@/components/order/StatusModal';
import { RefundModal } from '@/components/order/RefundModal';
import {
  useOrderList,
  useUpdateStatus,
  useRefundOrder,
  useExportOrders,
  useOrderDetail,
} from '@/hooks/use-orders';
import type { OrderListItem } from '@/services/order';
import { LoadingState, EmptyState, ErrorState } from '@/components/States';

const DEFAULT_FILTERS: OrderFiltersValue = {
  keyword: '',
  orderStatus: undefined,
  payStatus: undefined,
  dateRange: null,
};

export default function OrderPage() {
  // 列表筛选 + 分页
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<OrderFiltersValue>(DEFAULT_FILTERS);

  // 详情 modal 状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderListItem | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);

  // 改状态 modal 状态
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusOrder, setStatusOrder] = useState<OrderListItem | null>(null);

  // 退款 modal 状态
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<OrderListItem | null>(null);

  // 任意筛选变化 → 重置回第 1 页
  const onFiltersChange = useCallback((next: OrderFiltersValue) => {
    setFilters(next);
    setPage(1);
  }, []);

  // 拉列表 + 拉单个详情(items)
  const params = toListParams(filters, page, pageSize);
  const listQuery = useOrderList(params);
  const detailQuery = useOrderDetail(detailOrderId);
  const updateMut = useUpdateStatus();
  const refundMut = useRefundOrder();
  const exportCsv = useExportOrders(params);

  const onPageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  };

  const onDetail = (o: OrderListItem) => {
    setDetailOrder(o);
    setDetailOrderId(o.id);
    setDetailOpen(true);
  };

  const onExport = async () => {
    const res = await exportCsv();
    if (!res.ok) message.error(res.message || '导出失败');
    else message.success('已下载 CSV');
  };

  return (
    <div style={{ padding: 'var(--content-padding)' }}>
      <OrderFilters
        value={filters}
        onChange={onFiltersChange}
        onRefresh={() => listQuery.refetch()}
        onExport={onExport}
      />

      {listQuery.error ? (
        <ErrorState error={listQuery.error as Error} onRetry={listQuery.refetch} />
      ) : listQuery.isLoading ? (
        <LoadingState />
      ) : (listQuery.data?.list || []).length === 0 ? (
        <EmptyState description="暂无订单" />
      ) : (
        <OrderTable
          data={listQuery.data?.list || []}
          loading={listQuery.isFetching}
          page={page}
          pageSize={pageSize}
          total={listQuery.data?.total || 0}
          onPageChange={onPageChange}
          onDetail={onDetail}
          onChangeStatus={(o) => {
            setStatusOrder(o);
            setStatusOpen(true);
          }}
          onRefund={(o) => {
            setRefundOrder(o);
            setRefundOpen(true);
          }}
        />
      )}

      <OrderDetailModal
        open={detailOpen}
        order={detailOrder}
        items={(detailQuery.data?.items as any) || []}
        onClose={() => setDetailOpen(false)}
      />

      <StatusModal
        open={statusOpen}
        order={statusOrder}
        loading={updateMut.isPending}
        onCancel={() => setStatusOpen(false)}
        onSubmit={(p) => {
          updateMut.mutate(p, {
            onSuccess: () => setStatusOpen(false),
          });
        }}
      />

      <RefundModal
        open={refundOpen}
        order={refundOrder}
        loading={refundMut.isPending}
        onCancel={() => setRefundOpen(false)}
        onSubmit={(p) => {
          refundMut.mutate(p, {
            onSuccess: () => setRefundOpen(false),
          });
        }}
      />
    </div>
  );
}
