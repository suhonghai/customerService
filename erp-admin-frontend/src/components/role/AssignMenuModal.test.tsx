import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssignMenuModal } from './AssignMenuModal';
import type { RoleListItem } from '@/services/role';
import type { MenuNode } from '@/stores/menu';

// Mock role service functions
const mockGetRoleMenus = vi.fn();
const mockAssignMenus = vi.fn();
vi.mock('@/services/role', async () => {
  const actual = await vi.importActual<typeof import('@/services/role')>('@/services/role');
  return {
    ...actual,
    getRoleMenus: (...args: unknown[]) => mockGetRoleMenus(...args),
    assignMenus: (...args: unknown[]) => mockAssignMenus(...args),
  };
});

// Mock menu service
const mockFetchMenuTree = vi.fn();
vi.mock('@/services/menu', async () => {
  const actual = await vi.importActual<typeof import('@/services/menu')>('@/services/menu');
  return {
    ...actual,
    fetchMenuTree: (...args: unknown[]) => mockFetchMenuTree(...args),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseRole: RoleListItem = {
  id: 5,
  code: 'editor',
  name: '编辑角色',
  description: '用于测试',
  dataScope: 3,
  customDeptIds: null,
  sort: 5,
  status: 1,
  builtin: false,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

const menuTree: MenuNode[] = [
  {
    id: 1,
    parentId: null,
    name: '系统',
    path: '/system',
    component: null,
    icon: null,
    type: 1,
    permCode: null,
    sort: 0,
    visible: true,
    children: [
      {
        id: 2,
        parentId: 1,
        name: '用户',
        path: '/system/user',
        component: 'system/User/index',
        icon: null,
        type: 2,
        permCode: null,
        sort: 0,
        visible: true,
        children: [],
      },
      {
        id: 3,
        parentId: 1,
        name: '新增',
        path: null,
        component: null,
        icon: null,
        type: 3,
        permCode: 'user:create',
        sort: 0,
        visible: true,
      },
    ],
  },
];

beforeEach(() => {
  mockGetRoleMenus.mockReset();
  mockAssignMenus.mockReset();
  mockFetchMenuTree.mockReset();
});

describe('<AssignMenuModal />', () => {
  it('does not query menu tree when open=false', () => {
    render(wrap(<AssignMenuModal open={false} role={null} onClose={() => {}} />));
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
    expect(mockGetRoleMenus).not.toHaveBeenCalled();
  });

  it('renders modal title with role name when open + role provided', () => {
    mockFetchMenuTree.mockResolvedValue(menuTree);
    mockGetRoleMenus.mockResolvedValue([]);
    render(wrap(<AssignMenuModal open={true} role={baseRole} onClose={() => {}} />));
    expect(screen.getByText('分配菜单 - 编辑角色')).toBeTruthy();
  });

  it('shows loading text while menus query is loading', async () => {
    // 让 query 永远不 resolve,模拟 loading
    mockFetchMenuTree.mockReturnValue(new Promise(() => {}));
    render(wrap(<AssignMenuModal open={true} role={baseRole} onClose={() => {}} />));
    await waitFor(() => {
      expect(screen.getByText('加载菜单…')).toBeTruthy();
    });
  });

  it('loads role menus and builds tree when both queries resolve', async () => {
    mockFetchMenuTree.mockResolvedValue(menuTree);
    mockGetRoleMenus.mockResolvedValue([1, 3]);

    render(wrap(<AssignMenuModal open={true} role={baseRole} onClose={() => {}} />));

    // 等 tree 渲染完成 — antd Tree 用 title 属性承载文本节点
    await waitFor(() => {
      const titles = document.body.querySelectorAll('.ant-tree-title');
      const titleTexts = Array.from(titles).map((el) => el.textContent);
      expect(titleTexts).toContain('系统');
    });
    expect(mockGetRoleMenus).toHaveBeenCalledWith(5);
    // 注意:defaultExpandAll 只在 tree 初次挂载时生效,useEffect 后异步填充的 treeData 不会被自动展开
    // 所以这里只校验顶层节点"系统"出现,子节点的展开验证交给 role-utils.test.ts(已覆盖递归)
  });

  it('submitting calls assignMenus with collected checked menu ids', async () => {
    mockFetchMenuTree.mockResolvedValue(menuTree);
    mockGetRoleMenus.mockResolvedValue([1, 3]);
    mockAssignMenus.mockResolvedValue(undefined);

    render(wrap(<AssignMenuModal open={true} role={baseRole} onClose={() => {}} />));

    // 等 tree 渲染
    await waitFor(() => {
      const titles = document.body.querySelectorAll('.ant-tree-title');
      const titleTexts = Array.from(titles).map((el) => el.textContent);
      expect(titleTexts).toContain('系统');
    });

    // 点击 OK 按钮
    const okBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okBtn).toBeTruthy();
    fireEvent.click(okBtn!);

    await waitFor(() => {
      expect(mockAssignMenus).toHaveBeenCalled();
    });
    // 因为 useEffect 用 getRoleMenus(5).then → setAssignTree(buildTreeData([1,3]))
    // onCheck 没触发,所以 assignTree 中 checked=true 的 menuId = [1, 3]
    expect(mockAssignMenus).toHaveBeenCalledWith(5, [1, 3]);
  });

  it('clicking cancel calls onClose', async () => {
    mockFetchMenuTree.mockResolvedValue(menuTree);
    mockGetRoleMenus.mockResolvedValue([]);
    const onClose = vi.fn();

    render(wrap(<AssignMenuModal open={true} role={baseRole} onClose={onClose} />));

    await waitFor(() => {
      const titles = document.body.querySelectorAll('.ant-tree-title');
      const titleTexts = Array.from(titles).map((el) => el.textContent);
      expect(titleTexts).toContain('系统');
    });

    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement | null;
    expect(cancelBtn).toBeTruthy();
    await userEvent.setup().click(cancelBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it('onSuccess is called after successful assign', async () => {
    mockFetchMenuTree.mockResolvedValue(menuTree);
    mockGetRoleMenus.mockResolvedValue([1]);
    mockAssignMenus.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      wrap(<AssignMenuModal open={true} role={baseRole} onClose={onClose} onSuccess={onSuccess} />),
    );

    await waitFor(() => {
      const titles = document.body.querySelectorAll('.ant-tree-title');
      const titleTexts = Array.from(titles).map((el) => el.textContent);
      expect(titleTexts).toContain('系统');
    });

    const okBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    fireEvent.click(okBtn!);

    await waitFor(() => {
      expect(mockAssignMenus).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('closes modal cleanly when role is null', () => {
    mockFetchMenuTree.mockReturnValue(new Promise(() => {}));
    render(wrap(<AssignMenuModal open={true} role={null} onClose={() => {}} />));
    // title fallback to "分配菜单"
    expect(screen.getByText('分配菜单')).toBeTruthy();
  });
});
