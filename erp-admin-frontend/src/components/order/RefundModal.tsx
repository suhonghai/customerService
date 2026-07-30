import { useEffect, useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import type { OrderListItem } from '@/services/order';

export interface RefundModalProps {
  open: boolean;
  order: OrderListItem | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: { id: number; dto: { refundAmount: number; reason: string } }) => void;
}

/**
 * 退款弹窗。
 *
 * 内部持有金额 / 原因 input 态,通过 onSubmit 一次性抛给父容器。
 * 校验:金额必须 > 0,否则 toast 报错并不调 onSubmit。
 */
export function RefundModal({ open, order, loading, onCancel, onSubmit }: RefundModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // 每次打开清空
  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
    }
  }, [open]);

  const handleOk = () => {
    if (!order) return;
    const v = Number(amount);
    if (!v || v <= 0) {
      message.error('请输入有效金额');
      return;
    }
    onSubmit({
      id: order.id,
      dto: { refundAmount: v, reason: reason || '客户申请' },
    });
  };

  return (
    <Modal
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <DollarOutlined /> 退款
        </span>
      }
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="发起退款"
      cancelText="取消"
      destroyOnHidden
    >
      {order && (
        <div
          style={{
            padding: 12,
            background: 'var(--bg-sunken)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            订单 <span className="mono">{order.orderNo}</span>
          </div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
            ¥{Number(order.payAmount).toFixed(2)}
          </div>
          {order.refundAmount && Number(order.refundAmount) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              已退 ¥{Number(order.refundAmount).toFixed(2)}
            </div>
          )}
        </div>
      )}
      <Form layout="vertical">
        <Form.Item label="退款金额" required>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="0.00"
            step="0.01"
            prefix={<span className="mono">¥</span>}
          />
        </Form.Item>
        <Form.Item label="原因">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="客户申请退款"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
