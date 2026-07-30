import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { UserForm } from './UserForm';
import type { CreateUserDto, UserListItem } from '@/services/user';

const editingUser: UserListItem = {
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
  roles: [],
};

function Harness({
  editing,
  onSubmit,
}: {
  editing: UserListItem | null;
  onSubmit: (values: CreateUserDto) => void;
}) {
  const [form] = Form.useForm<CreateUserDto>();
  return <UserForm form={form} editing={editing} onSubmit={onSubmit} />;
}

describe('<UserForm />', () => {
  it('hides password and disables username in editing mode', { timeout: 15000 }, () => {
    render(<Harness editing={editingUser} onSubmit={() => {}} />);

    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByLabelText('Username')).toBeDisabled();
  });

  it('requires username and password in create mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness editing={null} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Password')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('请输入用户名')).toBeTruthy();
    expect(await screen.findByText('请输入密码')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid create values', { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness editing={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Password'), 'secret1');
    await user.type(screen.getByLabelText('Nickname'), 'New User');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      username: 'newuser',
      password: 'secret1',
      nickname: 'New User',
    });
  });
});
