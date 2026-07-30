import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoAccounts } from './DemoAccounts';
import { DEMO_ACCOUNTS } from './login-constants';

describe('<DemoAccounts />', () => {
  it('默认渲染 DEMO_ACCOUNTS 所有 chip(超级管理员 / 客服主管 / 内容编辑)', () => {
    render(<DemoAccounts onFill={() => {}} />);

    expect(screen.getByText('超级管理员')).toBeTruthy();
    expect(screen.getByText('客服主管')).toBeTruthy();
    expect(screen.getByText('内容编辑')).toBeTruthy();
  });

  it('显示 section 标题 (// demo · click to autofill)', () => {
    render(<DemoAccounts onFill={() => {}} />);
    expect(screen.getByText(/\/\/ demo · click to autofill/)).toBeTruthy();
  });

  it('点击 chip 触发 onFill(username, password)', async () => {
    const user = userEvent.setup();
    const onFill = vi.fn();

    render(<DemoAccounts onFill={onFill} />);

    await user.click(screen.getByText('超级管理员'));
    expect(onFill).toHaveBeenCalledWith('admin', 'Admin@123');

    await user.click(screen.getByText('客服主管'));
    expect(onFill).toHaveBeenCalledWith('agent_lead01', 'Lead@123');

    await user.click(screen.getByText('内容编辑'));
    expect(onFill).toHaveBeenCalledWith('editor01', 'Editor@123');

    expect(onFill).toHaveBeenCalledTimes(3);
  });

  it('accounts prop 可覆盖默认列表', () => {
    render(
      <DemoAccounts
        onFill={() => {}}
        accounts={[
          { username: 'u1', password: 'p1', label: '测试账号 A' },
          { username: 'u2', password: 'p2', label: '测试账号 B' },
        ]}
      />,
    );

    expect(screen.getByText('测试账号 A')).toBeTruthy();
    expect(screen.getByText('测试账号 B')).toBeTruthy();

    // 默认列表不应出现
    expect(screen.queryByText('超级管理员')).toBeNull();
  });

  it('空数组时不渲染任何 chip', () => {
    const { container } = render(<DemoAccounts onFill={() => {}} accounts={[]} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('覆盖 accounts 时 onFill 仍以传入的 username/password 触发', async () => {
    const user = userEvent.setup();
    const onFill = vi.fn();

    render(
      <DemoAccounts
        onFill={onFill}
        accounts={[{ username: 'override', password: 'Ov@123', label: '覆盖' }]}
      />,
    );

    await user.click(screen.getByText('覆盖'));
    expect(onFill).toHaveBeenCalledWith('override', 'Ov@123');
  });

  it('默认 DEMO_ACCOUNTS 长度 = 3', () => {
    expect(DEMO_ACCOUNTS.length).toBe(3);
  });
});
