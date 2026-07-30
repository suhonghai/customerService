import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { MenuFormModal } from './MenuFormModal';
import type { MenuFormValues } from './MenuFormModal';
import type { MenuListItem } from '@/services/menu';
import type { MenuNode } from '@/stores/menu';

const editingMenu: MenuListItem = {
  id: 5,
  parentId: null,
  name: '编辑测试',
  path: '/x',
  component: 'x/Index',
  icon: null,
  type: 2,
  permCode: null,
  sort: 0,
  visible: true,
  status: 1,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

const tree: MenuNode[] = [
  {
    id: 1,
    parentId: null,
    name: '系统',
    path: '/system',
    component: null,
    icon: null,
    type: 1,
    permCode: null,
    sort: 0,
    visible: true,
    children: [],
  },
];

function Harness({
  open = true,
  editing = null,
  treeQ = { isLoading: false, data: tree },
  loading = false,
  onCancel = () => {},
  onSubmit = () => {},
  withSubmitButton = false,
}: {
  open?: boolean;
  editing?: MenuListItem | null;
  treeQ?: { isLoading: boolean; data: MenuNode[] | undefined };
  loading?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  /** 渲染一个独立 submit button 用于触发 Form.validateFields */
  withSubmitButton?: boolean;
}) {
  const [form] = Form.useForm<MenuFormValues>();
  return (
    <>
      <MenuFormModal
        open={open}
        editing={editing}
        form={form}
        treeQ={treeQ}
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
              const values = await form.validateFields();
              onSubmit();
              void values;
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

describe('<MenuFormModal />', () => {
  it('renders 新增菜单/按钮 title + form fields when editing is null', { timeout: 15000 }, () => {
    render(<Harness />);
    // Modal 标题在 portal 里,RTL getByText 会搜整个 document
    expect(screen.getByText('新增菜单/按钮')).toBeTruthy();
    // 表单字段(label 在 Form.Item 上)
    expect(screen.getByText('父级')).toBeTruthy();
    expect(screen.getByText('类型')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('排序')).toBeTruthy();
    expect(screen.getByText('可见')).toBeTruthy();
    expect(screen.getByText('状态')).toBeTruthy();
  });

  it('renders 编辑菜单/按钮 title when editing provided', () => {
    render(<Harness editing={editingMenu} />);
    expect(screen.getByText('编辑菜单/按钮')).toBeTruthy();
  });

  it('does not render modal body when open=false', () => {
    render(<Harness open={false} />);
    expect(screen.queryByText('新增菜单/按钮')).toBeNull();
  });

  it('type=3 shows permCode (required) and hides path/component/icon', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // 找到 Modal 内"类型"label 所在的 Form.Item,然后定位它的 select selector
    // Form.Item 通过 .ant-form-item 渲染,label 是 .ant-form-item-label
    const formItems = Array.from(document.body.querySelectorAll('.ant-modal .ant-form-item'));
    const typeItem = formItems.find((it) =>
      it.querySelector('.ant-form-item-label')?.textContent?.includes('类型'),
    );
    expect(typeItem).toBeTruthy();
    const typeSelector = typeItem!.querySelector('.ant-select-selector') as HTMLElement;
    expect(typeSelector).toBeTruthy();
    await user.click(typeSelector);

    // 等 dropdown 展开
    await waitFor(
      () => {
        const open = document.body.querySelector(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
        );
        expect(open).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // 选中 "按钮"
    const btnOption = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
      (el) => el.textContent?.trim() === '按钮',
    );
    expect(btnOption).toBeTruthy();
    await user.click(btnOption as HTMLElement);

    // 按钮模式下:path / component / icon 隐藏
    await waitFor(() => {
      expect(screen.queryByText('路由路径')).toBeNull();
      expect(screen.queryByText('前端组件路径')).toBeNull();
      expect(screen.queryByText('图标')).toBeNull();
    });
    // 权限码字段(label 是 "权限码",不是 "权限码(可选)")
    expect(screen.getByText('权限码')).toBeTruthy();
  });

  it('type=2 (菜单) shows path/component/icon + permCode optional', () => {
    render(<Harness />);
    expect(screen.getByText('路由路径')).toBeTruthy();
    expect(screen.getByText('前端组件路径')).toBeTruthy();
    expect(screen.getByText('图标')).toBeTruthy();
    // permCode 是 optional("权限码(可选)")
    expect(screen.getByText('权限码(可选)')).toBeTruthy();
  });

  it('父级 select shows 顶层 when initial parentId is null', () => {
    render(<Harness />);
    // parentId: null → "顶层" 作为 selected value 显示(不是 placeholder)
    // 在 .ant-select-selection-item 里找 "顶层" 文本
    const topSelected = Array.from(
      document.body.querySelectorAll('.ant-modal .ant-select-selection-item'),
    ).find((el) => el.textContent?.includes('顶层'));
    expect(topSelected).toBeTruthy();
  });

  it('clicking 取消 button calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);

    // antd Modal footer 取消按钮
    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement | null;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn!);
    expect(onCancel).toHaveBeenCalled();
  });

  it('clicking 确定 button calls onSubmit', async () => {
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

  it('name field validation required triggers when name empty', { timeout: 15000 }, async () => {
    const onSubmit = vi.fn();
    render(<Harness withSubmitButton onSubmit={onSubmit} />);

    // 点击外置 validate 按钮 → 触发 form.validateFields()
    const validateBtn = screen.getByTestId('form-validate-btn');
    fireEvent.click(validateBtn);

    // 等错误元素出现
    await waitFor(
      () => {
        const errors = document.body.querySelectorAll('.ant-form-item-explain-error');
        expect(errors.length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
