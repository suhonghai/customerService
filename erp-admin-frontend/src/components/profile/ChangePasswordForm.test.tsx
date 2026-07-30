import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { ChangePasswordForm, type ChangePasswordValues } from './ChangePasswordForm';

function HostForm({
  onSubmit,
  loading = false,
}: {
  onSubmit: (v: { oldPassword: string; newPassword: string }) => void;
  loading?: boolean;
}) {
  const [form] = Form.useForm<ChangePasswordValues>();
  return <ChangePasswordForm form={form} loading={loading} onSubmit={onSubmit} />;
}

/**
 * antd 5.x Button autoInsertSpace 在中文之间插入空格,「保存」会被渲染为「保 存」。
 * 这里用正则匹配去掉空白后比较,锁定唯一的 button 元素(避免命中 span / tag)。
 */
function findSubmitBtn(): HTMLElement {
  const candidates = screen.getAllByText((_, n) => n?.textContent?.replace(/\s+/g, '') === '保存');
  const btn = candidates
    .map((el) => el.closest('button') ?? (el as HTMLElement))
    .find((el) => el.tagName === 'BUTTON') as HTMLElement;
  if (!btn) throw new Error('保存 button not found');
  return btn;
}

describe('<ChangePasswordForm />', () => {
  it('renders all 3 password fields + 保存 button', () => {
    render(<HostForm onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText('请输入当前密码')).toBeTruthy();
    expect(screen.getByPlaceholderText('至少 6 位')).toBeTruthy();
    expect(screen.getByPlaceholderText('再输入一次新密码')).toBeTruthy();
    expect(findSubmitBtn()).toBeTruthy();
  });

  it('shows loading state on submit button', () => {
    render(<HostForm onSubmit={() => {}} loading />);
    const btn = findSubmitBtn();
    expect((btn as HTMLButtonElement).className).toContain('ant-btn-loading');
  });

  it('old password < 6 chars is blocked by min rule', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HostForm onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText('请输入当前密码'), '12345');
    await user.type(screen.getByPlaceholderText('至少 6 位'), 'newpass1');
    await user.type(screen.getByPlaceholderText('再输入一次新密码'), 'newpass1');
    await user.click(findSubmitBtn());

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('required field blocks submit when old password empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HostForm onSubmit={onSubmit} />);

    // 不填任何字段,直接提交
    await user.click(findSubmitBtn());

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('new password === old password is rejected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HostForm onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText('请输入当前密码'), 'oldpass1');
    await user.type(screen.getByPlaceholderText('至少 6 位'), 'oldpass1');
    await user.type(screen.getByPlaceholderText('再输入一次新密码'), 'oldpass1');
    await user.click(findSubmitBtn());

    await waitFor(() => {
      expect(screen.getByText('新密码不能与旧密码相同')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('confirmPassword !== newPassword is rejected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HostForm onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText('请输入当前密码'), 'oldpass1');
    await user.type(screen.getByPlaceholderText('至少 6 位'), 'newpass2');
    await user.type(screen.getByPlaceholderText('再输入一次新密码'), 'different');
    await user.click(findSubmitBtn());

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('valid input triggers onSubmit with old/new passwords only', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<HostForm onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText('请输入当前密码'), 'oldpass1');
    await user.type(screen.getByPlaceholderText('至少 6 位'), 'newpass2');
    await user.type(screen.getByPlaceholderText('再输入一次新密码'), 'newpass2');
    await user.click(findSubmitBtn());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        oldPassword: 'oldpass1',
        newPassword: 'newpass2',
      });
    });
    // onSubmit 不应把 confirmPassword 上抛(由父级剔除)
    const last = onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0];
    expect(last).not.toHaveProperty('confirmPassword');
  });
});
