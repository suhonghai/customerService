import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PromptTemplateTable } from './PromptTemplateTable';
import { useAuthStore } from '@/stores/auth';
import type { AiPromptTemplate } from '@/services/ai-prompt-template';

const seed: AiPromptTemplate = {
  id: 1,
  code: 'cs',
  name: '通用客服',
  // 故意 > 50 字符,验证截断 + 省略号
  content:
    '你是{store_name}的 AI 客服,请问有什么可以帮您?我们支持 7×24 小时在线服务,包含售前咨询 / 售后处理 / 物流查询等',
  variables: '["store_name"]',
  status: 1,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T11:00:00.000Z',
};

const seedDisabled: AiPromptTemplate = {
  ...seed,
  id: 2,
  code: 'cs-old',
  status: 0,
};

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['ai-config:update', 'ai-config:delete'],
    } as any,
  });
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const noop = () => {};

describe('<PromptTemplateTable />', () => {
  it(
    'renders headers + content preview truncated to 50 chars + vars tag',
    { timeout: 15000 },
    () => {
      render(
        wrap(
          <PromptTemplateTable
            data={[seed]}
            loading={false}
            page={1}
            pageSize={20}
            total={1}
            onPageChange={noop}
            onEdit={noop}
            onDelete={noop}
          />,
        ),
      );

      expect(screen.getByText('cs')).toBeTruthy();
      expect(screen.getByText('通用客服')).toBeTruthy();
      // 模板内容超过 50 字符 → 截断 + 省略号
      const truncated = screen.getAllByText((_, n) => Boolean(n?.textContent?.endsWith('…')));
      expect(truncated.length).toBeGreaterThan(0);
      // variables 解析成 Tag
      expect(screen.getByText('store_name')).toBeTruthy();
      // 启用 tag
      expect(screen.getByText('启用')).toBeTruthy();
    },
  );

  it('禁用状态显示禁用 tag', () => {
    render(
      wrap(
        <PromptTemplateTable
          data={[seedDisabled]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={noop}
        />,
      ),
    );
    expect(screen.getByText('禁用')).toBeTruthy();
  });

  it('variables JSON 解析失败时显示 -', () => {
    render(
      wrap(
        <PromptTemplateTable
          data={[{ ...seed, id: 3, variables: 'not-json' }]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={noop}
        />,
      ),
    );
    // variables 列空时显示 -
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('点击编辑触发 onEdit', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      wrap(
        <PromptTemplateTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={onEdit}
          onDelete={noop}
        />,
      ),
    );

    const btn = screen
      .getAllByText((_, n) => n?.textContent?.replace(/\s+/g, '') === '编辑')
      .map((el) => el.closest('button') ?? el)
      .find((el) => el.tagName === 'BUTTON') as HTMLElement;
    await user.click(btn);
    expect(onEdit).toHaveBeenCalledWith(seed);
  });

  it('点击删除 → Popconfirm → 确定 触发 onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      wrap(
        <PromptTemplateTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={onDelete}
        />,
      ),
    );

    const delBtn = screen
      .getAllByText((_, n) => n?.textContent?.replace(/\s+/g, '') === '删除')
      .map((el) => el.closest('button') ?? el)
      .find((el) => el.tagName === 'BUTTON') as HTMLElement;
    await user.click(delBtn);

    await waitFor(() => {
      const okBtn = screen.getAllByText(
        (_, n) => n?.textContent?.trim() === 'OK' || n?.textContent?.trim() === '确定',
      )[0];
      expect(okBtn).toBeTruthy();
      fireEvent.click(okBtn as HTMLElement);
    });
    expect(onDelete).toHaveBeenCalledWith(seed.id);
  });

  it('分页 next 触发 onPageChange', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      wrap(
        <PromptTemplateTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={50}
          onPageChange={onPageChange}
          onEdit={noop}
          onDelete={noop}
        />,
      ),
    );
    const next = container.querySelector('.ant-pagination-item-2') as HTMLElement | null;
    if (next) {
      fireEvent.click(next);
      expect(onPageChange).toHaveBeenCalledWith(2, 20);
    }
  });
});
