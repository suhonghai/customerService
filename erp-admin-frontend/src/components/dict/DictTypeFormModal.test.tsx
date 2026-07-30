import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictTypeFormModal } from './DictTypeFormModal';

describe('<DictTypeFormModal />', () => {
  it('renders form fields when open', () => {
    render(
      <DictTypeFormModal open={true} loading={false} onCancel={() => {}} onSubmit={() => {}} />,
    );

    expect(screen.getByText('编码')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('备注')).toBeTruthy();
    expect(screen.getByPlaceholderText('如 order_status')).toBeTruthy();
  });

  it('空 code 提交触发 required 校验', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <DictTypeFormModal open={true} loading={false} onCancel={() => {}} onSubmit={onSubmit} />,
    );

    // 直接点 OK
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn);

    // onSubmit 不应该被触发
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('code 含非法字符触发 pattern 校验(中文/空格)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <DictTypeFormModal open={true} loading={false} onCancel={() => {}} onSubmit={onSubmit} />,
    );

    const codeInput = screen.getByPlaceholderText('如 order_status') as HTMLInputElement;
    // 输入含空格的非法 code
    await user.type(codeInput, 'has space');
    // 输入合法 name
    const nameInput = screen
      .getAllByRole('textbox')
      .find((el) => el !== codeInput) as HTMLInputElement;
    await user.type(nameInput, '测试');

    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    // pattern 校验失败 → onSubmit 不被触发
    expect(onSubmit).not.toHaveBeenCalled();

    // 清空 code,输入合法值
    await user.clear(codeInput);
    await user.type(codeInput, 'valid_code-1');
    await user.click(okBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'valid_code-1',
      name: '测试',
    });
  });

  it('合法表单 OK 触发 onSubmit + onCancel 不触发', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <DictTypeFormModal open={true} loading={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByPlaceholderText('如 order_status'), 'order_status');
    const nameInput = screen
      .getAllByRole('textbox')
      .find((el) => el.getAttribute('placeholder') !== '如 order_status') as HTMLInputElement;
    await user.type(nameInput, '订单状态');

    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'order_status',
      name: '订单状态',
    });
  });

  it('点击取消按钮触发 onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <DictTypeFormModal open={true} loading={false} onCancel={onCancel} onSubmit={() => {}} />,
    );

    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
