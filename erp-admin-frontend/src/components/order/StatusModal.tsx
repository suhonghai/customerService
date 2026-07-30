import { useState, useEffect } from 'react';
import { Modal, Form, Select, Input } from 'antd';
import { ORDER_STATUS, VALID_TRANSITIONS, SHIP_COMPANIES } from './order-constants';
import type { OrderListItem } from '@/services/order';

export interface StatusModalProps {
  open: boolean;
  order: OrderListItem | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    id: number;
    dto: {
      newStatus: number;
      shipNo?: string;
      shipCompany?: string;
    };
  }) => void;
}

/**
 * 修改订单状态弹窗。
 *
 * 内部持有 newStatus / shipNo / shipCompany 表单态,每次打开都从
 * `order` 重置初值(默认选第一个合法迁移状态)。
 */
export function StatusModal({ open, order, loading, onCancel, onSubmit }: StatusModalProps) {
  const transitions = (order && VALID_TRANSITIONS[order.orderStatus]) || [];
  const [newStatus, setNewStatus] = useState<number>(transitions[0] || 2);
  const [shipNo, setShipNo] = useState('');
  const [shipCompany, setShipCompany] = useState('');

  // 打开时重置初值 — 跟随 order 切换
  useEffect(() => {
    if (open) {
      setNewStatus(transitions[0] || 2);
      setShipNo('');
      setShipCompany('');
    }
    // transitions 来自 order.orderStatus,order 变化时重置就够了
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id, order?.orderStatus]);

  const handleOk = () => {
    if (!order) return;
    onSubmit({
      id: order.id,
      dto: {
        newStatus,
        shipNo: shipNo || undefined,
        shipCompany: shipCompany || undefined,
      },
    });
  };

  return (
    <Modal
      title="修改订单状态"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="更新"
      cancelText="取消"
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label="新状态">
          <Select
            value={newStatus}
            onChange={(v) => setNewStatus(v)}
            options={transitions.map((s) => ({
              value: s,
              label: ORDER_STATUS[s]?.label,
            }))}
          />
        </Form.Item>
        {newStatus === 2 && (
          <>
            <Form.Item label="物流单号" required>
              <Input
                value={shipNo}
                onChange={(e) => setShipNo(e.target.value)}
                placeholder="SF1234567890"
              />
            </Form.Item>
            <Form.Item label="物流公司" required>
              <Select
                value={shipCompany || undefined}
                onChange={setShipCompany}
                options={SHIP_COMPANIES}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
