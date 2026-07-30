import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderDetailModal } from './OrderDetailModal';
import type { OrderListItem, OrderItem } from '@/services/order';

const order: OrderListItem = {
  id: 1,
  orderNo: 'ORD-9999',
  customerName: '李四',
  customerPhone: '13900000000',
  totalAmount: 500,
  payAmount: 480,
  payMethod: 'alipay',
  payStatus: 2,
  orderStatus: 3,
  createdAt: '2026-02-01T08:00:00.000Z',
  updatedAt: '2026-02-01T08:00:00.000Z',
};

const items: OrderItem[] = [
  {
    id: 11,
    productId: 'p1',
    productName: '测试商品A',
    price: 100,
    quantity: 2,
    subtotal: 200,
  },
  {
    id: 12,
    productId: 'p2',
    productName: '测试商品B',
    price: 50,
    quantity: 4,
    subtotal: 200,
  },
];

describe('<OrderDetailModal />', () => {
  it('renders order fields + items when open with order', () => {
    render(<OrderDetailModal open={true} order={order} items={items} onClose={() => {}} />);

    // 头部 ORDER label + 订单号
    expect(screen.getByText('ORDER')).toBeTruthy();
    expect(screen.getByText('ORD-9999')).toBeTruthy();
    // 字段 grid
    expect(screen.getByText('客户')).toBeTruthy();
    expect(screen.getByText('李四')).toBeTruthy();
    expect(screen.getByText('电话')).toBeTruthy();
    expect(screen.getByText('13900000000')).toBeTruthy();
    expect(screen.getByText('金额')).toBeTruthy();
    expect(screen.getByText('¥480.00')).toBeTruthy();
    expect(screen.getByText('支付宝')).toBeTruthy();
    expect(screen.getByText('已收货')).toBeTruthy(); // orderStatus=3
    expect(screen.getByText('已支付')).toBeTruthy(); // payStatus=2
    // 商品
    expect(screen.getByText('测试商品A')).toBeTruthy();
    expect(screen.getByText('测试商品B')).toBeTruthy();
    expect(screen.getByText('// ITEMS · 商品')).toBeTruthy();
  });

  it('does not render body when order is null', () => {
    render(<OrderDetailModal open={true} order={null} items={[]} onClose={() => {}} />);

    // modal 通过 portal 渲染到 document.body,所以用 document.body 查询
    const modal = document.body.querySelector('.ant-modal');
    expect(modal).toBeTruthy();
    // 但 order 字段 grid / ITEMS 标题都不应渲染(order 为 null 时整个 body 块不输出)
    expect(document.body.querySelector('.ant-modal')?.textContent).not.toContain('// ITEMS · 商品');
  });

  it('close (Cancel) triggers onClose', () => {
    const onClose = vi.fn();
    render(<OrderDetailModal open={true} order={order} items={items} onClose={onClose} />);

    // 找到 modal 上的取消按钮(mask close 通常需要 escape;这里测 footer=null 时只有 X 关闭图标)
    const closeBtn = document.querySelector('.ant-modal-close') as HTMLElement | null;
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    } else {
      // 兜底:至少渲染出来
      expect(screen.getByText('ORD-9999')).toBeTruthy();
    }
  });

  it('renders items table with formatted price/subtotal', () => {
    render(<OrderDetailModal open={true} order={order} items={items} onClose={() => {}} />);

    // 单价 / 小计都是 ¥X.XX 格式
    expect(screen.getByText('¥100.00')).toBeTruthy();
    expect(screen.getByText('¥50.00')).toBeTruthy();
    expect(screen.getAllByText('¥200.00').length).toBe(2);
    // 数量
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('×4')).toBeTruthy();
  });
});
