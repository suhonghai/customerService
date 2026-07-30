import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { message } from 'antd';
import { RefundModal } from './RefundModal';
import type { OrderListItem } from '@/services/order';

const order: OrderListItem = {
  id: 50,
  orderNo: 'ORD-50',
  customerName: '退款测试',
  customerPhone: '13700000000',
  totalAmount: 1000,
  payAmount: 1000,
  payStatus: 2,
  orderStatus: 3,
  refundAmount: 100,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

describe('<RefundModal />', () => {
  it('renders order info + amount input + reason input', () => {
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText('退款')).toBeTruthy();
    expect(screen.getByText('ORD-50')).toBeTruthy();
    expect(screen.getByText('¥1000.00')).toBeTruthy();
    expect(screen.getByText('已退 ¥100.00')).toBeTruthy();
    expect(screen.getByPlaceholderText('0.00')).toBeTruthy();
    expect(screen.getByPlaceholderText('客户申请退款')).toBeTruthy();
  });

  it('cancel triggers onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={onCancel}
        onSubmit={() => {}}
      />,
    );

    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submit with valid amount calls onSubmit with refundAmount + default reason', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    await user.type(amountInput, '200');

    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.id).toBe(50);
    expect(arg.dto.refundAmount).toBe(200);
    expect(arg.dto.reason).toBe('客户申请'); // 默认值
  });

  it('submit with empty reason still defaults to "客户申请"', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText('0.00'), '50');
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    expect(onSubmit.mock.calls[0][0].dto.reason).toBe('客户申请');
  });

  it('submit with custom reason preserves it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText('0.00'), '80');
    await user.type(screen.getByPlaceholderText('客户申请退款'), '质量问题');
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    expect(onSubmit.mock.calls[0][0].dto.reason).toBe('质量问题');
  });

  it('invalid amount (<=0) blocks submit + shows error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const errSpy = vi.spyOn(message, 'error').mockImplementation(() => 1);
    render(
      <RefundModal
        open={true}
        order={order}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText('0.00'), '0');
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('请输入有效金额');

    errSpy.mockRestore();
  });
});
