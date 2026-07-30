import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuTable } from './MenuTable';
import { useAuthStore } from '@/stores/auth';
import type { MenuListItem } from '@/services/menu';

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['menu:update', 'menu:delete'] as any,
    } as any,
  });
});

const baseMenu: MenuListItem = {
  id: 1,
  parentId: null,
  name: '系统',
  path: '/system',
  component: null,
  icon: 'SettingOutlined',
  type: 1,
  permCode: null,
  sort: 0,
  visible: true,
  status: 1,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

const buttonMenu: MenuListItem = {
  ...baseMenu,
  id: 2,
  name: '新增',
  type: 3,
  permCode: 'menu:create',
  path: null,
  component: null,
  icon: null,
};

const disabledMenu: MenuListItem = {
  ...baseMenu,
  id: 3,
  name: '禁用菜单',
  status: 0,
  visible: false,
};

describe('<MenuTable />', () => {
  it('renders row + key columns (名称/路径/权限码/排序/可见/状态)', { timeout: 15000 }, () => {
    render(<MenuTable data={[baseMenu]} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByText('系统')).toBeTruthy();
    expect(screen.getByText('/system')).toBeTruthy();
    expect(screen.getByText('SettingOutlined')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy(); // sort
    expect(screen.getByText('是')).toBeTruthy(); // visible
    expect(screen.getByText('启用')).toBeTruthy(); // status
    // TYPE_LABEL tag for type 1 = 目录
    expect(screen.getByText('目录')).toBeTruthy();
  });

  it('renders 按钮 type with permCode tag and "无" for path', () => {
    render(<MenuTable data={[buttonMenu]} onEdit={() => {}} onDelete={() => {}} />);

    // 按钮 type 显示 permCode tag
    expect(screen.getByText('menu:create')).toBeTruthy();
    // 按钮 type 显示 TYPE_LABEL = 按钮
    expect(screen.getByText('按钮')).toBeTruthy();
    // path 为 null 时显示 "无"
    expect(screen.getByText('无')).toBeTruthy();
  });

  it('renders 禁用 + 不可见 tag', () => {
    render(<MenuTable data={[disabledMenu]} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByText('禁用')).toBeTruthy(); // status
    expect(screen.getByText('否')).toBeTruthy(); // visible
  });

  it('clicking 编辑 triggers onEdit with the row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<MenuTable data={[baseMenu]} onEdit={onEdit} onDelete={() => {}} />);

    // antd Button 中文字符间会插空格("编 辑"),用 function matcher 去掉空白
    // 找包含编辑文本的 button 元素
    const editBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first button:not(.ant-btn-dangerous)',
    ) as HTMLElement;
    expect(editBtn).toBeTruthy();
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(baseMenu);
  });

  it('clicking 删除 confirms via Popconfirm then triggers onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<MenuTable data={[baseMenu]} onEdit={() => {}} onDelete={onDelete} />);

    // 删除 button 是 danger 类的
    const delBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    ) as HTMLElement;
    expect(delBtn).toBeTruthy();
    await user.click(delBtn);
    // antd Popconfirm 的确定按钮在 .ant-popconfirm-buttons .ant-btn-primary
    const confirm = document.body.querySelector(
      '.ant-popconfirm-buttons .ant-btn-primary',
    ) as HTMLElement;
    expect(confirm).toBeTruthy();
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledWith(baseMenu.id);
  });
});
