import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserTable } from './UserTable';
import { useAuthStore } from '@/stores/auth';
import type { UserListItem } from '@/services/user';

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'token',
    refreshToken: 'refresh',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['user:update', 'user:delete'],
    } as any,
  });
});

const userRow: UserListItem = {
  id: 7,
  username: 'alice',
  nickname: 'Alice',
  email: 'alice@example.com',
  phone: null,
  avatar: null,
  departmentId: null,
  status: 1,
  lastLoginAt: null,
  lastLoginIp: null,
  failedLoginCount: 0,
  lockedUntil: null,
  remark: null,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
  roles: [{ id: 1, code: 'admin', name: '管理员' }],
};

describe('<UserTable />', () => {
  it('renders avatar initial, roles, status and core columns', { timeout: 15000 }, () => {
    render(
      <UserTable
        data={[userRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('@alice')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('admin')).toHaveClass('tag-info');
    expect(screen.getByText('active')).toHaveClass('tag-success');
    expect(screen.getByText('2026-07-16')).toBeTruthy();
  });

  it('uses username initial and renders disabled status when nickname is missing', () => {
    render(
      <UserTable
        data={[{ ...userRow, nickname: null, username: 'bob', status: 0, roles: [] }]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('disabled')).toHaveClass('tag-danger');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('triggers edit and delete callbacks', { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <UserTable
        data={[userRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(userRow);

    await user.click(screen.getByText('Delete'));
    const confirm = document.body.querySelector(
      '.ant-popconfirm-buttons .ant-btn-primary',
    ) as HTMLElement;
    expect(confirm).toBeTruthy();
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledWith(userRow.id);
  });

  it('renders empty data and loading states', async () => {
    const { rerender } = render(
      <UserTable
        data={[]}
        loading={false}
        page={1}
        pageSize={20}
        total={0}
        onPageChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getAllByTitle('No data').length).toBeGreaterThan(0);

    await act(async () => {
      rerender(
        <UserTable
          data={[]}
          loading
          page={1}
          pageSize={20}
          total={0}
          onPageChange={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.getByTestId('user-table-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('triggers pagination callback', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      <UserTable
        data={[userRow]}
        page={1}
        pageSize={20}
        total={50}
        onPageChange={onPageChange}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const pageTwo = container.querySelector('.ant-pagination-item-2');
    expect(pageTwo).toBeTruthy();
    fireEvent.click(pageTwo!);
    expect(onPageChange).toHaveBeenCalledWith(2, 20);
  });
});
