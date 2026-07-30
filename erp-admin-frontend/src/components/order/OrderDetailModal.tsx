import { Modal, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ORDER_STATUS, PAY_STATUS, PAY_METHOD_LABEL } from './order-constants';
import type { OrderListItem, OrderItem } from '@/services/order';

export interface OrderDetailModalProps {
  open: boolean;
  order: OrderListItem | null;
  items: OrderItem[];
  onClose: () => void;
}

/**
 * 订单详情弹窗 — 头部字段 grid + 商品 items table。
 *
 * 数据已经在父容器里 fetch 完了(items 通过 props 传进来),这里只渲染。
 */
export function OrderDetailModal({ open, order, items, onClose }: OrderDetailModalProps) {
  const detailFields: Array<[string, string | number | null | undefined]> = order
    ? [
        ['客户', order.customerName],
        ['电话', order.customerPhone],
        ['金额', `¥${Number(order.payAmount).toFixed(2)}`],
        ['支付方式', PAY_METHOD_LABEL[order.payMethod || ''] || order.payMethod || '-'],
        ['订单状态', ORDER_STATUS[order.orderStatus]?.label],
        ['支付状态', PAY_STATUS[order.payStatus]?.label],
      ]
    : [];

  const itemColumns: ColumnsType<OrderItem> = [
    { title: '商品', dataIndex: 'productName' },
    {
      title: '单价',
      dataIndex: 'price',
      align: 'right',
      render: (v) => <span className="mono">¥{Number(v).toFixed(2)}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      align: 'right',
      render: (v) => <span className="mono">×{v}</span>,
    },
    {
      title: '小计',
      dataIndex: 'subtotal',
      align: 'right',
      render: (v) => (
        <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          ¥{Number(v).toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <Modal
      title={
        order && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontWeight: 600,
                letterSpacing: '0.08em',
              }}
            >
              ORDER
            </span>
            <span className="mono" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {order.orderNo}
            </span>
          </div>
        )
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnHidden
    >
      {order && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {detailFields.map(([k, v]) => (
              <div
                key={k}
                style={{
                  background: 'var(--bg-sunken)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {k}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}
                >
                  {v as string}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 8,
            }}
          >
            // ITEMS · 商品
          </div>
          <Table<OrderItem>
            size="small"
            pagination={false}
            dataSource={items}
            rowKey="id"
            columns={itemColumns}
          />
        </div>
      )}
    </Modal>
  );
}
