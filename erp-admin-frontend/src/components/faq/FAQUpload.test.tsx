import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAQUpload } from './FAQUpload';

function makeFile(name: string) {
  return new File(['hello'], name, { type: 'text/plain' });
}

/** 通过按钮 role 找 Modal 上的「确定 / OK / 上传」按钮(处理 antd 5.x autoInsertSpace 空格) */
function findConfirmBtn(): HTMLElement {
  const all = screen.getAllByRole('button');
  const btn = all.find((b) => {
    const t = (b.textContent || '').replace(/\s+/g, '');
    return t === 'OK' || t === '确定' || t === '上传';
  });
  if (!btn) throw new Error('confirm button not found');
  return btn;
}

describe('<FAQUpload />', () => {
  it('renders Modal title + fields + dragger hint', () => {
    render(
      <FAQUpload
        open
        loading={false}
        file={null}
        onFileChange={() => {}}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('上传 FAQ')).toBeTruthy();
    expect(screen.getByText('标题')).toBeTruthy();
    expect(screen.getByText('分类')).toBeTruthy();
    expect(screen.getByText('标签')).toBeTruthy();
    expect(screen.getByText('支持 .md / .txt / .pdf,单文件')).toBeTruthy();
  });

  it('submit with empty file does not fire onSubmit', async () => {
    const onSubmit = vi.fn();
    render(
      <FAQUpload
        open
        loading={false}
        file={null}
        onFileChange={() => {}}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(findConfirmBtn());
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('submit with file + filled fields fires onSubmit with values', async () => {
    const onSubmit = vi.fn();
    const file = makeFile('test.md');
    const user = userEvent.setup();
    render(
      <FAQUpload
        open
        loading={false}
        file={file}
        onFileChange={() => {}}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const titleInput = screen.getByPlaceholderText('FAQ 文档标题');
    await user.type(titleInput, '退款流程');
    fireEvent.click(findConfirmBtn());
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: '退款流程' }), file),
    );
  });

  it('title required rule blocks submit', async () => {
    const onSubmit = vi.fn();
    const file = makeFile('test.md');
    render(
      <FAQUpload
        open
        loading={false}
        file={file}
        onFileChange={() => {}}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(findConfirmBtn());
    await waitFor(() => {
      expect(screen.getByText('请输入标题')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <FAQUpload
        open
        loading={false}
        file={null}
        onFileChange={() => {}}
        onCancel={onCancel}
        onSubmit={() => {}}
      />,
    );
    const close = document.body.querySelector('.ant-modal-close') as HTMLElement | null;
    if (close) (close as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalled();
  });
});
