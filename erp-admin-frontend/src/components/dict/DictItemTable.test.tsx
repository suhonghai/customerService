import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictItemTable } from './DictItemTable';
import { useAuthStore } from '@/stores/auth';
import type { DictItem } from '@/services/dict';

// 默认赋权,字典项编辑/删除按钮可见
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['dict:update', 'dict:delete'] as any,
    } as any,
  });
});

const baseItem: DictItem = {
  id: 1,
  typeId: 10,
  label: '已支付',
  value: 'paid',
  sort: 1,
  isDefault: false,
  cssClass: 'green',
  remark: '已支付状态',
  status: 1,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
};

const anotherItem: DictItem = {
  ...baseItem,
  id: 2,
  typeId: 10,
  label: '已退款',
  value: 'refunded',
  sort: 2,
  isDefault: true,
  cssClass: null,
  remark: null,
};

describe('<DictItemTable />', () => {
  it('selectedTypeName 为 null 时不渲染整张表', () => {
    const { container } = render(
      <DictItemTable
        data={[baseItem]}
        onEdit={() => {}}
        onDelete={() => {}}
        selectedTypeName={null}
      />,
    );

    // 整个 component 返回 null,container.body 只剩 wrapper,无任何 dict item 内容
    expect(container.textContent).toBe('');
    expect(screen.queryByText('已支付')).toBeNull();
  });

  it('selectedTypeName 有值时渲染行 + 关键列', () => {
    render(
      <DictItemTable
        data={[baseItem, anotherItem]}
        onEdit={() => {}}
        onDelete={() => {}}
        selectedTypeName="订单状态"
      />,
    );

    // 标签 + 值
    expect(screen.getByText('已支付')).toBeTruthy();
    expect(screen.getByText('paid')).toBeTruthy();
    expect(screen.getByText('已退款')).toBeTruthy();
    expect(screen.getByText('refunded')).toBeTruthy();
    // 颜色列(cssClass 渲染为 Tag 文本)
    expect(screen.getByText('green')).toBeTruthy();
    // isDefault=true 的项显示「是」
    const yesTags = screen.getAllByText('是');
    expect(yesTags.length).toBeGreaterThanOrEqual(1);
  });

  it('cssClass 为 null 时显示占位,isDefault 为 false 时不显示「是」', () => {
    const itemNoColor = { ...baseItem, cssClass: null, isDefault: false, remark: null };
    render(
      <DictItemTable
        data={[itemNoColor]}
        onEdit={() => {}}
        onDelete={() => {}}
        selectedTypeName="测试类型"
      />,
    );

    // 颜色列:cssClass 为 null 时显示占位
    expect(screen.queryByText('green')).toBeNull();
    // 默认列:false 时不显示「是」
    expect(screen.queryByText('是')).toBeNull();
  });

  it('点击编辑触发 onEdit', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <DictItemTable
        data={[baseItem]}
        onEdit={onEdit}
        onDelete={() => {}}
        selectedTypeName="订单状态"
      />,
    );

    // antd Button 中文按钮文字中可能含零宽空格, 直接 querySelector 锁定行内按钮更稳
    const editBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first .ant-btn:not(.ant-btn-dangerous)',
    ) as HTMLElement;
    expect(editBtn).toBeTruthy();
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(baseItem);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('点击删除按钮触发 Popconfirm,确认后调用 onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <DictItemTable
        data={[baseItem]}
        onEdit={() => {}}
        onDelete={onDelete}
        selectedTypeName="订单状态"
      />,
    );

    // 锁定行内右侧操作列的删除按钮(ant-btn-dangerous)
    const deleteBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first .ant-btn-dangerous',
    ) as HTMLElement;
    expect(deleteBtn).toBeTruthy();
    await user.click(deleteBtn);
    // Popconfirm 弹出后点确认
    const okBtn = document.body.querySelector(
      '.ant-popover-buttons .ant-btn-primary, .ant-popconfirm-buttons .ant-btn-primary',
    ) as HTMLElement;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn);
    expect(onDelete).toHaveBeenCalledWith(baseItem.id);
  });

  it('无权限时编辑/删除按钮不渲染', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rt',
      userInfo: {
        id: 1,
        username: 'tester',
        permissions: [] as any,
      } as any,
    });

    render(
      <DictItemTable
        data={[baseItem]}
        onEdit={() => {}}
        onDelete={() => {}}
        selectedTypeName="订单状态"
      />,
    );

    expect(document.body.querySelector('.ant-table-cell-fix-right-first .ant-btn')).toBeNull();
  });
});
