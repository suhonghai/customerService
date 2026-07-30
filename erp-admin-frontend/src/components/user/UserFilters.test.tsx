import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFilters } from './UserFilters';
import { useAuthStore } from '@/stores/auth';

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'token',
    refreshToken: 'refresh',
    userInfo: { id: 1, username: 'tester', permissions: ['user:create'] } as any,
  });
});

describe('<UserFilters />', () => {
  it('submits keyword and triggers create', { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onCreate = vi.fn();
    render(<UserFilters onSearch={onSearch} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText('搜索用户名 / 昵称 / 邮箱');
    await user.type(input, 'alice{enter}');
    expect(onSearch).toHaveBeenCalledWith('alice');

    await user.click(screen.getByText('New User'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('clears the keyword', () => {
    const onSearch = vi.fn();
    const { container } = render(<UserFilters onSearch={onSearch} onCreate={() => {}} />);
    const input = screen.getByPlaceholderText('搜索用户名 / 昵称 / 邮箱');
    fireEvent.change(input, { target: { value: 'alice' } });
    const clear = container.querySelector('.ant-input-clear-icon');
    expect(clear).toBeTruthy();
    fireEvent.click(clear!);
    expect(onSearch).toHaveBeenCalledWith('');
  });
});
