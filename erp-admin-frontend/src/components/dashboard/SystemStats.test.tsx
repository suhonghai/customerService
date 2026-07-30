import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemStats } from './SystemStats';

describe('<SystemStats />', () => {
  it('renders all 4 titles', () => {
    render(<SystemStats usersCount={10} rolesCount={5} menusCount={20} permissionsCount={8} />);
    expect(screen.getByText('Users · 用户')).toBeTruthy();
    expect(screen.getByText('Roles · 角色')).toBeTruthy();
    expect(screen.getByText('Menus · 菜单')).toBeTruthy();
    expect(screen.getByText('Permissions · 权限')).toBeTruthy();
  });

  it('renders numeric values when provided', () => {
    render(<SystemStats usersCount={42} rolesCount={7} menusCount={33} permissionsCount={12} />);
    // antd Statistic 把 value 渲染成 .ant-statistic-content-value
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('falls back to "—" when counts are undefined', () => {
    render(<SystemStats permissionsCount={0} />);
    // 3 个 '—' 兜底(User/Role/Menu);Permissions 是 0 不兜底
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(3);
  });

  it('renders loading skeleton when loading=true (skeleton el)', () => {
    const { container } = render(
      <SystemStats
        usersCount={1}
        usersLoading
        rolesCount={1}
        menusCount={1}
        permissionsCount={1}
      />,
    );
    // antd Statistic loading 时渲染 .ant-skeleton 元素
    const skeletons = container.querySelectorAll('.ant-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders section tag for §02', () => {
    render(<SystemStats permissionsCount={0} />);
    expect(screen.getByText('§ 02')).toBeTruthy();
    expect(screen.getByText('System / 核心指标')).toBeTruthy();
  });
});
