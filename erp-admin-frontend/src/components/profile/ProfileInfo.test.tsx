import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileInfo } from './ProfileInfo';
import type { MeResponse } from '@/services/profile';

const baseMe: MeResponse = {
  id: 1,
  username: 'alice',
  nickname: 'Alice',
  email: 'alice@example.com',
  phone: '13800000000',
  avatar: null,
  roles: [
    { id: 1, code: 'admin', name: '管理员' },
    { id: 2, code: 'cs', name: '客服' },
  ],
  permissions: ['user:list', 'role:list'],
  lastLoginAt: '2026-07-10T08:30:00.000Z',
  lastLoginIp: '10.0.0.1',
  createdAt: '2025-01-15T00:00:00.000Z',
};

describe('<ProfileInfo />', () => {
  it('renders nothing when me is null', () => {
    const { container } = render(<ProfileInfo me={null} />);
    expect(container.querySelector('.ant-descriptions')).toBeNull();
  });

  it('renders all fields with values when me is provided', () => {
    render(<ProfileInfo me={baseMe} />);

    // 用户名 / 昵称 / 邮箱 / 手机号
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('13800000000')).toBeTruthy();

    // 角色 tag 列表
    expect(screen.getByText('管理员')).toBeTruthy();
    expect(screen.getByText('客服')).toBeTruthy();

    // 最后登录 IP
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
  });

  it('renders all field labels', () => {
    render(<ProfileInfo me={baseMe} />);
    ['用户名', '昵称', '邮箱', '手机号', '角色', '最后登录时间', '最后登录 IP', '创建时间'].forEach(
      (label) => {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      },
    );
  });

  it('falls back to "-" for empty optional string fields', () => {
    const meEmpty: MeResponse = {
      ...baseMe,
      nickname: null,
      email: null,
      phone: null,
      lastLoginIp: null,
    };
    render(<ProfileInfo me={meEmpty} />);
    // 4 个 '-' 兜底(昵称 / 邮箱 / 手机号 / 最后登录 IP)+ 1 个创建时间 fallback
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('renders "无" tag when roles list is empty', () => {
    const meNoRoles: MeResponse = { ...baseMe, roles: [] };
    render(<ProfileInfo me={meNoRoles} />);
    expect(screen.getByText('无')).toBeTruthy();
  });

  it('renders "无" tag when roles is missing', () => {
    const meMissingRoles = { ...baseMe, roles: undefined as any };
    render(<ProfileInfo me={meMissingRoles} />);
    expect(screen.getByText('无')).toBeTruthy();
  });

  it('renders "-" for lastLoginAt and createdAt when null/undefined', () => {
    const meNoDates: MeResponse = {
      ...baseMe,
      lastLoginAt: null,
      createdAt: '' as any,
    };
    render(<ProfileInfo me={meNoDates} />);
    // fmt() 对 null/空串都返回 '-';两个时间字段各一个 '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
