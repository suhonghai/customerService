import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusModal } from './StatusModal';
import type { OrderListItem } from '@/services/order';

const orderPending: OrderListItem = {
  id: 100,
  orderNo: 'ORD-100',
  customerName: '测试',
  customerPhone: '13800000000',
  totalAmount: 100,
  payAmount: 100,
  payStatus: 2,
  orderStatus: 1, // 待发货 → [2,5]
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('<StatusModal />', () => {
  it('renders only valid transitions in the select', async () => {
    const user = userEvent.setup();
    render(
      <StatusModal
        open={true}
        order={orderPending}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    // Modal 里有 2 个 combobox(新状态 Select + 物流公司 Select),用 name 锁定第一个
    const selects = screen.getAllByRole('combobox');
    await user.click(selects[0]);

    // 等到第一个 combobox 展开
    await waitFor(
      () => {
        expect(selects[0].getAttribute('aria-expanded')).toBe('true');
      },
      { timeout: 3000 },
    );

    // 找到展开的 dropdown (排除 hidden class 且有 options 的)
    const dropdowns = Array.from(document.body.querySelectorAll('.ant-select-dropdown'));
    const visible = dropdowns.find(
      (d) =>
        !d.classList.contains('ant-select-dropdown-hidden') &&
        d.querySelectorAll('.ant-select-item-option').length > 0,
    );
    expect(visible).toBeTruthy();
    const labels = Array.from(visible!.querySelectorAll('.ant-select-item-option')).map(
      (o) => o.textContent?.trim() || '',
    );

    // orderStatus=1 (待发货) → 合法迁移是 [2,5]:已发货、已取消
    expect(labels).toEqual(expect.arrayContaining(['已发货', '已取消']));
    expect(labels).not.toContain('待发货');
  }, 10000);

  it('showing shipping fields when newStatus === 2 (已发货)', async () => {
    const user = userEvent.setup();
    render(
      <StatusModal
        open={true}
        order={orderPending}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    // 初始默认选 transitions[0]=2,所以应该已经显示物流单号/物流公司
    expect(screen.getByText('物流单号')).toBeTruthy();
    expect(screen.getByText('物流公司')).toBeTruthy();
    expect(screen.getByPlaceholderText('SF1234567890')).toBeTruthy();
  });

  it('cancel button triggers onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <StatusModal
        open={true}
        order={orderPending}
        loading={false}
        onCancel={onCancel}
        onSubmit={() => {}}
      />,
    );

    // antd Modal 把中文按钮文本渲染时中间会有零宽空格,
    // 用 regex 匹配更稳。modal portal 到 document.body,直接 query。
    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('OK submits payload with id + newStatus + shipping info', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <StatusModal
        open={true}
        order={orderPending}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const shipInput = screen.getByPlaceholderText('SF1234567890') as HTMLInputElement;
    await user.type(shipInput, 'SF9876543210');

    // antd primary footer button
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.id).toBe(100);
    expect(arg.dto.newStatus).toBe(2);
    expect(arg.dto.shipNo).toBe('SF9876543210');
  });

  it('does nothing on OK when order is null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <StatusModal
        open={true}
        order={null}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
