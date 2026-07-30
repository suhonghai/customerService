import { Table, Tag, Button, Space, Card } from 'antd';
import type { TablePaginationConfig } from 'antd/es/table';
import type { ColumnsType } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import { ORDER_STATUS, PAY_STATUS, PAY_METHOD_LABEL, VALID_TRANSITIONS } from './order-constants';
import type { OrderListItem } from '@/services/order';

export interface OrderTableProps {
  data: OrderListItem[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onDetail: (o: OrderListItem) => void;
  onChangeStatus: (o: OrderListItem) => void;
  onRefund: (o: OrderListItem) => void;
}

/**
 * 订单表格 — 列定义、排序、行内操作按钮组。
 *
 * 纯展示 + 事件回调,不持有任何业务状态。所有权限校验通过 PermissionButton 完成。
 */
export function OrderTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
  onChangeStatus,
  onRefund,
}: OrderTableProps) {
  const columns: ColumnsType<OrderListItem> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 170,
      render: (n: string) => (
        <span
          className="mono"
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}
        >
          {n}
        </span>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customerName',
      render: (n: string, o) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{n}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {o.customerPhone}
          </div>
        </div>
      ),
    },
    {
      title: '金额',
      dataIndex: 'payAmount',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.payAmount) - Number(b.payAmount),
      render: (v: any) => (
        <span
          className="mono"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
        >
          ¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: '支付',
      dataIndex: 'payMethod',
      width: 80,
      render: (m: string) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {PAY_METHOD_LABEL[m || ''] || '-'}
        </span>
      ),
    },
    {
      title: '支付状态',
      dataIndex: 'payStatus',
      width: 110,
      render: (s: number) => {
        const meta = PAY_STATUS[s] || { label: '未知', cls: 'tag-neutral' };
        return (
          <Tag className={meta.cls} style={{ margin: 0 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '订单状态',
      dataIndex: 'orderStatus',
      width: 110,
      render: (s: number) => {
        const meta = ORDER_STATUS[s] || { label: '未知', cls: 'tag-neutral' };
        return (
          <Tag className={meta.cls} style={{ margin: 0 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '创建',
      dataIndex: 'createdAt',
      width: 100,
      render: (d: string) =>
        d ? (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {new Date(d).toISOString().slice(0, 10)}
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, o) => {
        const transitions = VALID_TRANSITIONS[o.orderStatus] || [];
        return (
          <Space size={4}>
            <Button size="small" type="text" onClick={() => onDetail(o)}>
              详情
            </Button>
            <PermissionButton permCode="order:update-status">
              {transitions.length > 0 ? (
                <Button
                  size="small"
                  type="text"
                  onClick={() => onChangeStatus(o)}
                  style={{ color: 'var(--text-primary)' }}
                >
                  改状态
                </Button>
              ) : null}
            </PermissionButton>
            <PermissionButton permCode="order:refund">
              {o.payStatus === 2 ? (
                <Button size="small" type="text" danger onClick={() => onRefund(o)}>
                  退款
                </Button>
              ) : null}
            </PermissionButton>
          </Space>
        );
      },
    },
  ];

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showTotal: (t) => (
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {t} orders
      </span>
    ),
    onChange: onPageChange,
  };

  return (
    <Card
      className="reveal reveal-2"
      styles={{ body: { padding: 0 } }}
      style={{ overflow: 'hidden' }}
    >
      <Table<OrderListItem>
        rowKey="id"
        dataSource={data}
        scroll={{ x: 1100 }}
        columns={columns}
        loading={loading}
        pagination={pagination}
      />
    </Card>
  );
}
