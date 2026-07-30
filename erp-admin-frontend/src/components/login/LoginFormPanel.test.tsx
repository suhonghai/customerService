import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { LoginFormPanel } from './LoginFormPanel';
import type { LoginFormValues } from './login-constants';

/**
 * LoginFormPanel 必须被 Form.Provider 包起来才能拿到 form 实例;
 * 这里用最薄壳子 —— 一个 controlled 的 wrapper,提供 form 给 panel。
 */
function Wrapper({
  loading = false,
  errMsg = null,
  onSubmit = vi.fn(),
  onFillDemo = vi.fn(),
}: {
  loading?: boolean;
  errMsg?: string | null;
  onSubmit?: (v: LoginFormValues) => void;
  onFillDemo?: (u: string, p: string) => void;
}) {
  const [form] = Form.useForm<LoginFormValues>();
  return (
    <LoginFormPanel
      form={form}
      loading={loading}
      errMsg={errMsg}
      onSubmit={onSubmit}
      onFillDemo={onFillDemo}
    />
  );
}

describe('<LoginFormPanel />', () => {
  it('渲染标题 + Welcome back + 文案', () => {
    render(<Wrapper />);

    expect(screen.getByText(/Welcome back\./i)).toBeTruthy();
    expect(screen.getByText(/Credentials \/ 凭证/)).toBeTruthy();
    expect(screen.getByText(/输入你的账号信息继续/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('username / password 输入框可见', () => {
    const { container } = render(<Wrapper />);
    // antd 的 input 至少 2 个:username + password
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    // username 输入的 placeholder
    expect(screen.getByPlaceholderText('admin')).toBeTruthy();
  });

  it('errMsg 非空时显示错误条且带 role=alert', () => {
    render(<Wrapper errMsg="账号或密码错误" />);
    const alert = screen.getByTestId('login-error');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('账号或密码错误');
  });

  it('errMsg 为 null 时不渲染错误条', () => {
    render(<Wrapper errMsg={null} />);
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  it('空表单提交触发必填校验,不直接调 onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Wrapper onSubmit={onSubmit} />);

    await user.click(screen.getByText('Continue'));

    // 校验提示出现
    expect(await screen.findByText('请输入用户名')).toBeTruthy();
    expect(await screen.findByText('请输入密码')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('填写 username + password 后提交触发 onSubmit(values)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Wrapper onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText('admin'), 'admin');
    await user.type(screen.getByPlaceholderText('••••••••'), 'Admin@123');
    await user.click(screen.getByText('Continue'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      username: 'admin',
      password: 'Admin@123',
    });
  });

  it('loading=true 时 Continue 按钮处于 loading 状态', () => {
    render(<Wrapper loading />);
    // antd Button loading 时 className 包含 ant-btn-loading
    const btn = screen.getByText('Continue').closest('button');
    expect(btn?.className || '').toMatch(/ant-btn-loading/);
  });

  it('demo chip 点击触发 onFillDemo', async () => {
    const user = userEvent.setup();
    const onFillDemo = vi.fn();

    render(<Wrapper onFillDemo={onFillDemo} />);

    await user.click(screen.getByText('超级管理员'));
    expect(onFillDemo).toHaveBeenCalledWith('admin', 'Admin@123');
  });

  it('同时存在 form error 时仍然能点击 demo chip 触发回调', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onFillDemo = vi.fn();

    render(<Wrapper onSubmit={onSubmit} onFillDemo={onFillDemo} errMsg="失败" />);

    // 错误提示
    expect(screen.getByTestId('login-error')).toBeTruthy();
    // demo chip 仍可点
    await user.click(screen.getByText('客服主管'));
    expect(onFillDemo).toHaveBeenCalledWith('agent_lead01', 'Lead@123');
  });
});
