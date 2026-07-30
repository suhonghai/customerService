import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHero } from './DashboardHero';
import type { UserInfo } from '@/stores/auth';

const baseUser: UserInfo = {
  id: 1,
  username: 'alice',
  nickname: 'Alice',
  avatar: null,
  roles: [
    { id: 1, code: 'admin', name: '管理员' },
    { id: 2, code: 'cs', name: '客服' },
  ],
  permissions: ['user:view', 'role:view'],
};

describe('<DashboardHero />', () => {
  it('renders greeting for 4 hour buckets (0/6/12/18)', () => {
    const { rerender } = render(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 0, 0)}
      />,
    );
    expect(screen.getByText(/Good night,/).textContent).toContain('Good night');

    rerender(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 9, 0)}
      />,
    );
    expect(screen.getByText(/Good morning,/).textContent).toContain('Good morning');

    rerender(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 14, 0)}
      />,
    );
    expect(screen.getByText(/Good afternoon,/).textContent).toContain('Good afternoon');

    rerender(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 21, 0)}
      />,
    );
    expect(screen.getByText(/Good evening,/).textContent).toContain('Good evening');
  });

  it('prefers nickname over username in greeting', () => {
    render(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 10, 0)}
      />,
    );
    // 昵称 Alice 在 em 标签里出现
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('falls back to username when nickname missing', () => {
    const noNick: UserInfo = { ...baseUser, nickname: undefined as any };
    render(
      <DashboardHero
        userInfo={noNick}
        perms={noNick.permissions}
        now={new Date(2026, 6, 16, 10, 0)}
      />,
    );
    expect(screen.getByText('alice')).toBeTruthy();
  });

  it('renders "—" for roles when empty', () => {
    const noRoles: UserInfo = { ...baseUser, roles: [] };
    render(
      <DashboardHero
        userInfo={noRoles}
        perms={noRoles.permissions}
        now={new Date(2026, 6, 16, 10, 0)}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders perms count', () => {
    render(
      <DashboardHero
        userInfo={baseUser}
        perms={['a', 'b', 'c']}
        now={new Date(2026, 6, 16, 10, 0)}
      />,
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders date string in section-tag', () => {
    render(
      <DashboardHero
        userInfo={baseUser}
        perms={baseUser.permissions}
        now={new Date(2026, 6, 16, 10, 0)}
      />,
    );
    // 7 月 16 日会渲染 "16" + "2026";不强校验 locale 月份(依赖运行环境)
    expect(screen.getByText(/Dashboard \/ .*2026/)).toBeTruthy();
  });

  it('handles userInfo = null gracefully (no name segment)', () => {
    render(<DashboardHero userInfo={null} perms={[]} now={new Date(2026, 6, 16, 10, 0)} />);
    // greeting 仍渲染,但 em 段无文本(空)
    expect(screen.getByText(/Good morning,/).textContent).toContain('Good morning');
    // roles 兜底为 '—'
    expect(screen.getByText('—')).toBeTruthy();
  });
});
