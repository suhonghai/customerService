import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAccessGrid } from './QuickAccessGrid';

describe('<QuickAccessGrid />', () => {
  it('renders all 9 default links', () => {
    render(<QuickAccessGrid perms={['*']} onNavigate={() => {}} />);
    [
      'Users',
      'Roles',
      'Menus',
      'AI Models',
      'Sessions',
      'Stats',
      'Audit',
      'Dict',
      'Profile',
    ].forEach((title) => {
      expect(screen.getByText(title)).toBeTruthy();
    });
  });

  it('renders section tag for §03', () => {
    render(<QuickAccessGrid perms={['*']} onNavigate={() => {}} />);
    expect(screen.getByText('§ 03')).toBeTruthy();
    expect(screen.getByText('Quick Access / 快速入口')).toBeTruthy();
  });

  it('grayed + "no permission" when perms missing', () => {
    render(<QuickAccessGrid perms={[]} onNavigate={() => {}} />);
    // 8 个有 perm 的链接全 no permission;Profile 无 perm 总是 enabled
    const noPermissionLabels = screen.getAllByText('· no permission');
    expect(noPermissionLabels.length).toBe(8);
  });

  it('enabled link triggers onNavigate', async () => {
    const user = userEvent.setup();
    const onNav = vi.fn();
    render(<QuickAccessGrid perms={['user:view']} onNavigate={onNav} />);

    const userCard = screen.getByTestId('quick-link-/system/user');
    await user.click(userCard);
    expect(onNav).toHaveBeenCalledWith('/system/user');
  });

  it('disabled link does NOT trigger onNavigate', async () => {
    const user = userEvent.setup();
    const onNav = vi.fn();
    render(<QuickAccessGrid perms={[]} onNavigate={onNav} />);

    // /system/user 需要 user:view,空 perms 应被禁用
    const userCard = screen.getByTestId('quick-link-/system/user');
    expect(userCard.getAttribute('data-enabled')).toBe('0');
    await user.click(userCard);
    expect(onNav).not.toHaveBeenCalled();
  });

  it('wildcard `*` enables every link', () => {
    render(<QuickAccessGrid perms={['*']} onNavigate={() => {}} />);
    expect(screen.queryByText('· no permission')).toBeNull();
  });

  it('module wildcard `user:*` enables user link', () => {
    const onNav = vi.fn();
    render(<QuickAccessGrid perms={['user:*']} onNavigate={onNav} />);
    const userCard = screen.getByTestId('quick-link-/system/user');
    expect(userCard.getAttribute('data-enabled')).toBe('1');
    fireEvent.click(userCard);
    expect(onNav).toHaveBeenCalledWith('/system/user');
  });

  it('profile (no perm) is always enabled even with empty perms', () => {
    const onNav = vi.fn();
    render(<QuickAccessGrid perms={[]} onNavigate={onNav} />);
    const profileCard = screen.getByTestId('quick-link-/profile');
    expect(profileCard.getAttribute('data-enabled')).toBe('1');
    fireEvent.click(profileCard);
    expect(onNav).toHaveBeenCalledWith('/profile');
  });
});
