import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictTypeTable } from './DictTypeTable';
import { useAuthStore } from '@/stores/auth';
import type { DictType } from '@/services/dict';

// Auth store 默认无权限 → 删除按钮被 PermissionButton 抑制;
// 需要测删除按钮时再单独赋权
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['dict:delete'] as any,
    } as any,
  });
});

const baseType: DictType = {
  id: 1,
  code: 'order_status',
  name: '订单状态',
  remark: '订单状态字典',
  itemCount: 5,
  activeItemCount: 3,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
};

const anotherType: DictType = {
  ...baseType,
  id: 2,
  code: 'pay_method',
  name: '支付方式',
  remark: null,
  itemCount: 0,
  activeItemCount: 0,
};

describe('<DictTypeTable />', () => {
  it('renders rows with key columns (编码/名称/项数)', () => {
    render(
      <DictTypeTable data={[baseType, anotherType]} onSelect={() => {}} onDelete={() => {}} />,
    );

    // 编码列
    expect(screen.getByText('order_status')).toBeTruthy();
    expect(screen.getByText('pay_method')).toBeTruthy();
    // 名称列
    expect(screen.getByText('订单状态')).toBeTruthy();
    expect(screen.getByText('支付方式')).toBeTruthy();
    // 项数列(active / total)
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    // 备注列(第二个为 null,显示占位)
    expect(screen.getByText('订单状态字典')).toBeTruthy();
  });

  it('click row triggers onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DictTypeTable data={[baseType, anotherType]} onSelect={onSelect} onDelete={() => {}} />,
    );

    // 点击 order_status 那一行
    await user.click(screen.getByText('order_status'));
    expect(onSelect).toHaveBeenCalledWith(baseType);

    await user.click(screen.getByText('pay_method'));
    expect(onSelect).toHaveBeenCalledWith(anotherType);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('selected row has ant-table-row-selected class', () => {
    const { container } = render(
      <DictTypeTable
        data={[baseType, anotherType]}
        selectedId={baseType.id}
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );

    // 选中行应该有 .ant-table-row-selected class
    const selectedRows = container.querySelectorAll('tr.ant-table-row-selected');
    expect(selectedRows.length).toBe(1);

    // 该行包含 order_status
    expect(selectedRows[0].textContent).toContain('order_status');
  });

  it('删除按钮触发 onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<DictTypeTable data={[baseType]} onSelect={() => {}} onDelete={onDelete} />);

    // antd Button 渲染中文时会在字符间插零宽空格 → accessible name 变成 "删 除"
    // 用 querySelector 直接锁定 ant-btn-danger 按钮更稳
    const deleteBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first .ant-btn-dangerous',
    ) as HTMLElement;
    expect(deleteBtn).toBeTruthy();
    await user.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(baseType);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('无权限时删除按钮不渲染', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rt',
      userInfo: {
        id: 1,
        username: 'tester',
        permissions: [] as any,
      } as any,
    });

    render(<DictTypeTable data={[baseType]} onSelect={() => {}} onDelete={() => {}} />);

    expect(
      document.body.querySelector('.ant-table-cell-fix-right-first .ant-btn-dangerous'),
    ).toBeNull();
  });

  it('空数据时仍渲染表头', () => {
    render(<DictTypeTable data={[]} onSelect={() => {}} onDelete={() => {}} />);

    // 表头列名还在
    expect(screen.getByText('编码')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('项数')).toBeTruthy();
  });
});
