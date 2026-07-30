import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { MenuNode } from '@/stores/menu';

// 共享的 navigate mock
const mockNavigate = vi.hoisted(() => vi.fn<(path: string) => void>());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { AppSider, toMenuItems, findFirstPath } from './AppSider';

const fakeTree: MenuNode[] = [
  {
    id: 1,
    parentId: null,
    name: '数据看板',
    path: '/stats',
    component: null,
    icon: null,
    type: 2,
    permCode: null,
    sort: 0,
    visible: true,
  },
  {
    id: 2,
    parentId: null,
    name: '系统管理',
    path: '/system',
    component: null,
    icon: null,
    type: 1,
    permCode: null,
    sort: 1,
    visible: true,
    children: [
      {
        id: 21,
        parentId: 2,
        name: '用户管理',
        path: '/system/user',
        component: null,
        icon: null,
        type: 2,
        permCode: null,
        sort: 0,
        visible: true,
      },
    ],
  },
  {
    id: 99,
    parentId: null,
    name: '隐藏菜单',
    path: '/hidden',
    component: null,
    icon: null,
    type: 2,
    permCode: null,
    sort: 2,
    visible: false,
  },
];

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('toMenuItems', () => {
  it('filters out invisible and type 3 nodes, keeps 1+2', () => {
    const items = toMenuItems(fakeTree) as Array<{ key: string; label?: string }>;
    const labels = items.map((i) => i.key);
    expect(labels).toContain('/stats');
    expect(labels).toContain('/system');
    // hidden=true 的菜单被过滤
    expect(labels).not.toContain('/hidden');
  });

  it('builds children for 目录 nodes', () => {
    const items = toMenuItems(fakeTree) as Array<{
      key: string;
      children?: Array<{ key: string }>;
    }>;
    const systemItem = items.find((i) => i.key === '/system');
    expect(systemItem?.children).toBeDefined();
    expect(systemItem?.children?.[0].key).toBe('/system/user');
  });

  it('sorts items by sort field', () => {
    const unsorted: MenuNode[] = [
      { ...fakeTree[0], sort: 5 },
      { ...fakeTree[1], sort: 1 },
    ];
    const items = toMenuItems(unsorted) as Array<{ key: string }>;
    expect(items[0].key).toBe('/system');
    expect(items[1].key).toBe('/stats');
  });
});

describe('findFirstPath', () => {
  it('returns first type-2 path in tree', () => {
    expect(findFirstPath(fakeTree)).toBe('/stats');
  });
  it('descends into children to find leaf path', () => {
    const onlySystem: MenuNode[] = [fakeTree[1]];
    expect(findFirstPath(onlySystem)).toBe('/system/user');
  });
  it('returns undefined when no type-2 path', () => {
    const dirsOnly: MenuNode[] = [{ ...fakeTree[1], children: [] }];
    expect(findFirstPath(dirsOnly)).toBeUndefined();
  });
});

describe('AppSider', () => {
  it('renders menu items from tree', () => {
    renderWithProviders(
      <AppSider
        tree={fakeTree}
        isLoading={false}
        collapsed={false}
        onCollapse={vi.fn()}
        selectedKey="/stats"
      />,
    );
    // 数据看板 是菜单项 label
    expect(screen.getByText('数据看板')).toBeInTheDocument();
    expect(screen.getByText('系统管理')).toBeInTheDocument();
  });

  it('shows brand-mark without version sub when collapsed', () => {
    renderWithProviders(
      <AppSider
        tree={fakeTree}
        isLoading={false}
        collapsed={true}
        onCollapse={vi.fn()}
        selectedKey="/stats"
      />,
    );
    // collapsed 状态 brand 显示 "W&" 不带 "ERP v0.1"
    expect(screen.queryByText('v0.1')).not.toBeInTheDocument();
  });

  it('calls onCollapse when bottom trigger is clicked', () => {
    const onCollapse = vi.fn();
    renderWithProviders(
      <AppSider
        tree={fakeTree}
        isLoading={false}
        collapsed={false}
        onCollapse={onCollapse}
        selectedKey="/stats"
      />,
    );
    fireEvent.click(screen.getByText('« collapse'));
    expect(onCollapse).toHaveBeenCalledWith(true);
  });

  it('navigates when menu item clicked', () => {
    renderWithProviders(
      <AppSider
        tree={fakeTree}
        isLoading={false}
        collapsed={false}
        onCollapse={vi.fn()}
        selectedKey="/stats"
      />,
    );
    fireEvent.click(screen.getByText('数据看板'));
    expect(mockNavigate).toHaveBeenCalledWith('/stats');
  });

  it('shows Spin when isLoading is true', () => {
    const { container } = renderWithProviders(
      <AppSider
        tree={undefined}
        isLoading={true}
        collapsed={false}
        onCollapse={vi.fn()}
        selectedKey="/"
      />,
    );
    expect(container.querySelector('.ant-spin')).toBeInTheDocument();
    // 数据看板 不在 loading 状态渲染
    expect(screen.queryByText('数据看板')).not.toBeInTheDocument();
  });
});
