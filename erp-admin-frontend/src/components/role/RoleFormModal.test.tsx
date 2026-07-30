import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { RoleFormModal } from './RoleFormModal';
import type { RoleFormValues } from './RoleFormModal';
import type { RoleListItem } from '@/services/role';

const editingRole: RoleListItem = {
  id: 5,
  code: 'editor',
  name: '编辑角色',
  description: '用于测试',
  dataScope: 3,
  customDeptIds: null,
  sort: 5,
  status: 1,
  builtin: false,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

function Harness({
  open = true,
  editing = null,
  loading = false,
  onCancel = () => {},
  onSubmit = () => {},
  withSubmitButton = false,
}: {
  open?: boolean;
  editing?: RoleListItem | null;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  withSubmitButton?: boolean;
}) {
  const [form] = Form.useForm<RoleFormValues>();
  return (
    <>
      <RoleFormModal
        open={open}
        editing={editing}
        form={form}
        loading={loading}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
      {withSubmitButton && (
        <button
          type="button"
          data-testid="form-validate-btn"
          onClick={async () => {
            try {
              await form.validateFields();
              onSubmit();
            } catch {
              /* validation errors are rendered by Form */
            }
          }}
        >
          Validate
        </button>
      )}
    </>
  );
}

describe('<RoleFormModal />', () => {
  it('renders 新增角色 title + all 6 form fields when editing is null', { timeout: 15000 }, () => {
    render(<Harness />);
    expect(screen.getByText('新增角色')).toBeTruthy();
    // 6 个 label
    expect(screen.getByText('编码')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('描述')).toBeTruthy();
    expect(screen.getByText('数据权限')).toBeTruthy();
    expect(screen.getByText('排序')).toBeTruthy();
    expect(screen.getByText('状态')).toBeTruthy();
  });

  it('renders 编辑角色 title when editing provided', () => {
    render(<Harness editing={editingRole} />);
    expect(screen.getByText('编辑角色')).toBeTruthy();
  });

  it('code input is disabled in editing mode', () => {
    render(<Harness editing={editingRole} />);
    const codeInput = document.body.querySelector('.ant-modal input[disabled]') as HTMLInputElement;
    expect(codeInput).toBeTruthy();
  });

  it('code input is NOT disabled when adding new role', () => {
    render(<Harness />);
    const disabledInputs = document.body.querySelectorAll('.ant-modal input[disabled]');
    expect(disabledInputs.length).toBe(0);
  });

  it('does not render modal body when open=false', () => {
    render(<Harness open={false} />);
    expect(screen.queryByText('新增角色')).toBeNull();
  });

  it('clicking 取消 calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);

    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement | null;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn!);
    expect(onCancel).toHaveBeenCalled();
  });

  it('clicking 确定 calls onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const okBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okBtn).toBeTruthy();
    await user.click(okBtn!);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('code required validation triggers when empty', { timeout: 15000 }, async () => {
    const onSubmit = vi.fn();
    render(<Harness withSubmitButton onSubmit={onSubmit} />);

    const validateBtn = screen.getByTestId('form-validate-btn');
    fireEvent.click(validateBtn);

    await waitFor(
      () => {
        const errors = document.body.querySelectorAll('.ant-form-item-explain-error');
        expect(errors.length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dataScope select shows "全部" default option', () => {
    render(<Harness />);
    // dataScope initialValue=1 → DATA_SCOPE_OPTIONS[0] = 全部
    // 在 .ant-modal .ant-select-selection-item 里找 全部 文本
    const selected = Array.from(
      document.body.querySelectorAll('.ant-modal .ant-select-selection-item'),
    );
    expect(selected.some((el) => el.textContent?.includes('全部'))).toBe(true);
  });
});
