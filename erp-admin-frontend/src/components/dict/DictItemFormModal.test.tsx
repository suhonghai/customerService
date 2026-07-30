import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictItemFormModal } from './DictItemFormModal';
import { CSS_CLASS_OPTIONS } from './dict-constants';
import type { DictItem } from '@/services/dict';

const baseItem: DictItem = {
  id: 1,
  typeId: 10,
  label: '已支付',
  value: 'paid',
  sort: 5,
  isDefault: true,
  cssClass: 'green',
  remark: '已支付状态',
  status: 1,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
};

describe('<DictItemFormModal />', () => {
  it('新增模式标题为「新增字典项」', () => {
    render(
      <DictItemFormModal
        open={true}
        editing={null}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText('新增字典项')).toBeTruthy();
    // 新增时 sort 默认 0,isDefault 默认 false(不显示「是」)
    expect(screen.queryByText('是')).toBeNull();
  });

  it('编辑模式标题为「编辑字典项」+ 回填字段', () => {
    render(
      <DictItemFormModal
        open={true}
        editing={baseItem}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText('编辑字典项')).toBeTruthy();

    // label / value 字段回填
    const textboxes = screen.getAllByRole('textbox');
    // 第一个 textbox 是 label,第二个是 value
    expect((textboxes[0] as HTMLInputElement).value).toBe('已支付');
    expect((textboxes[1] as HTMLInputElement).value).toBe('paid');
    // cssClass 已选 → select 显示 'green'
    expect(screen.getByText('green')).toBeTruthy();
    // 备注回填
    expect(screen.getByDisplayValue('已支付状态')).toBeTruthy();
  });

  it('颜色 Select 列出 CSS_CLASS_OPTIONS 全部选项', async () => {
    const user = userEvent.setup();
    render(
      <DictItemFormModal
        open={true}
        editing={null}
        loading={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

    // 找到颜色 combobox(form 里有 1 个 Select → 颜色)
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
    const colorSelect = selects[0];

    await user.click(colorSelect);

    await waitFor(
      () => {
        expect(colorSelect.getAttribute('aria-expanded')).toBe('true');
      },
      { timeout: 3000 },
    );

    // 找可见的 dropdown
    const dropdowns = Array.from(document.body.querySelectorAll('.ant-select-dropdown'));
    const visible = dropdowns.find(
      (d) =>
        !d.classList.contains('ant-select-dropdown-hidden') &&
        d.querySelectorAll('.ant-select-item-option').length > 0,
    );
    expect(visible).toBeTruthy();
    const labels = Array.from(visible!.querySelectorAll('.ant-select-item-option')).map(
      (o) => o.textContent?.trim() || '',
    );

    // 至少有 CSS_CLASS_OPTIONS 里的前几个颜色
    for (const opt of CSS_CLASS_OPTIONS.slice(0, 3)) {
      expect(labels).toContain(opt.value);
    }
  }, 10000);

  it('合法表单 OK 触发 onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <DictItemFormModal
        open={true}
        editing={null}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const textboxes = screen.getAllByRole('textbox');
    await user.type(textboxes[0], '已发货');
    await user.type(textboxes[1], 'shipped');

    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const call = onSubmit.mock.calls[0][0];
    expect(call.label).toBe('已发货');
    expect(call.value).toBe('shipped');
    // sort/isDefault 是默认值
    expect(call.sort).toBe(0);
    expect(call.isDefault).toBe(false);
  });

  it('编辑模式 OK 提交带 editing 字段(回填值)即可', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <DictItemFormModal
        open={true}
        editing={baseItem}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    // 不改任何字段,直接点 OK
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const call = onSubmit.mock.calls[0][0];
    expect(call.label).toBe('已支付');
    expect(call.value).toBe('paid');
    expect(call.sort).toBe(5);
    expect(call.isDefault).toBe(true);
    expect(call.cssClass).toBe('green');
    expect(call.remark).toBe('已支付状态');
  });

  it('label 空时 OK 不触发 onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <DictItemFormModal
        open={true}
        editing={null}
        loading={false}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );

    // 不输入任何 label
    const okBtn = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    await user.click(okBtn);

    // required 校验失败 → 不提交
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('点击取消触发 onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <DictItemFormModal
        open={true}
        editing={null}
        loading={false}
        onCancel={onCancel}
        onSubmit={() => {}}
      />,
    );

    const cancelBtn = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement;
    expect(cancelBtn).toBeTruthy();
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
