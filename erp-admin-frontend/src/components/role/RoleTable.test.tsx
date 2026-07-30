import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleTable } from './RoleTable';
import { useAuthStore } from '@/stores/auth';
import type { RoleListItem } from '@/services/role';

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['role:update', 'role:assign-menu', 'role:delete'] as any,
    } as any,
  });
});

const baseRole: RoleListItem = {
  id: 1,
  code: 'admin',
  name: '超级管理员',
  description: '系统内置管理员',
  dataScope: 1,
  customDeptIds: null,
  sort: 0,
  status: 1,
  builtin: false,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

const builtinRole: RoleListItem = {
  ...baseRole,
  id: 2,
  code: 'builtin',
  name: '内置角色',
  builtin: true,
};

const disabledRole: RoleListItem = {
  ...baseRole,
  id: 3,
  code: 'guest',
  name: '访客',
  status: 0,
};

function Harness({
  roles = [baseRole],
  page = 1,
  pageSize = 20,
  total = 1,
  onPageChange = () => {},
  onEdit = () => {},
  onAssignMenu = () => {},
  onDelete = () => {},
}: {
  roles?: RoleListItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number, ps: number) => void;
  onEdit?: (r: RoleListItem) => void;
  onAssignMenu?: (r: RoleListItem) => void;
  onDelete?: (id: number) => void;
}) {
  return (
    <RoleTable
      data={roles}
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      onEdit={onEdit}
      onAssignMenu={onAssignMenu}
      onDelete={onDelete}
    />
  );
}

describe('<RoleTable />', () => {
  it(
    'renders key columns (编码 / 名称 / 数据权限 / 状态 / 内置 / 排序)',
    { timeout: 15000 },
    () => {
      render(<Harness />);

      expect(screen.getByText('admin')).toBeTruthy();
      expect(screen.getByText('超级管理员')).toBeTruthy();
      expect(screen.getByText('全部')).toBeTruthy(); // dataScope=1 → DATA_SCOPE_LABEL
      expect(screen.getByText('启用')).toBeTruthy(); // status=1
      expect(screen.getByText('-')).toBeTruthy(); // builtin=false → '-'
      expect(screen.getByText('0')).toBeTruthy(); // sort
    },
  );

  it('renders disabled status with "禁用" text', () => {
    render(<Harness roles={[disabledRole]} />);
    expect(screen.getByText('禁用')).toBeTruthy();
  });

  it('renders builtin=true with "是" tag', () => {
    render(<Harness roles={[builtinRole]} />);
    expect(screen.getByText('是')).toBeTruthy();
  });

  it('does NOT render delete button for builtin role', () => {
    render(<Harness roles={[builtinRole]} />);

    // builtin 的行没有 danger 类按钮
    const dangerBtns = document.body.querySelectorAll(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    );
    expect(dangerBtns.length).toBe(0);
  });

  it('renders delete button for non-builtin role', () => {
    render(<Harness roles={[baseRole]} />);

    const dangerBtns = document.body.querySelectorAll(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    );
    expect(dangerBtns.length).toBe(1);
  });

  it('clicking 编辑 triggers onEdit with the row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Harness onEdit={onEdit} />);

    // 操作列在 .ant-table-cell-fix-right-first;
    // 编辑 button 是非 danger 的(从右数第 1 个,顺序:编辑 / 分配菜单 / 删除)
    const editBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first button:nth-of-type(1)',
    ) as HTMLElement;
    expect(editBtn).toBeTruthy();
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(baseRole);
  });

  it('clicking 分配菜单 triggers onAssignMenu with the row', async () => {
    const user = userEvent.setup();
    const onAssignMenu = vi.fn();
    render(<Harness onAssignMenu={onAssignMenu} />);

    // 第二个非 danger button = 分配菜单(操作列里第二个 button)
    const assignBtn = Array.from(
      document.body.querySelectorAll('.ant-table-cell-fix-right-first button'),
    ).find((el) => !el.classList.contains('ant-btn-dangerous')) as HTMLElement;
    expect(assignBtn).toBeTruthy();
    // 第一个非 danger 是 编辑,第二个非 danger 是 分配菜单
    const allBtns = Array.from(
      document.body.querySelectorAll('.ant-table-cell-fix-right-first button'),
    ).filter((el) => !el.classList.contains('ant-btn-dangerous'));
    expect(allBtns.length).toBe(2);
    await user.click(allBtns[1]);
    expect(onAssignMenu).toHaveBeenCalledWith(baseRole);
  });

  it('clicking 删除 confirms via Popconfirm then triggers onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);

    const delBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    ) as HTMLElement;
    expect(delBtn).toBeTruthy();
    await user.click(delBtn);

    // antd Popconfirm 的确定按钮
    const confirm = document.body.querySelector(
      '.ant-popconfirm-buttons .ant-btn-primary',
    ) as HTMLElement;
    expect(confirm).toBeTruthy();
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledWith(baseRole.id);
  });

  it('renders multiple rows', () => {
    render(<Harness roles={[baseRole, builtinRole, disabledRole]} />);
    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('builtin')).toBeTruthy();
    expect(screen.getByText('guest')).toBeTruthy();
  });

  it('hides action buttons when user lacks role:delete permission', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rt',
      userInfo: {
        id: 1,
        username: 'tester',
        permissions: ['role:update'] as any, // 故意不授予 delete
      } as any,
    });
    render(<Harness roles={[baseRole]} />);
    const dangerBtns = document.body.querySelectorAll(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    );
    expect(dangerBtns.length).toBe(0);
  });
});
