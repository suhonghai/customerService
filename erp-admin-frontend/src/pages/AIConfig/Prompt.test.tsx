import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PromptTemplatePage from './Prompt';
import { useAuthStore } from '@/stores/auth';
import type { AiPromptTemplate } from '@/services/ai-prompt-template';

// 拦截 /ai-prompt-templates 走 request,避免真实 axios
vi.mock('@/services/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import request from '@/services/request';
const mockedGet = vi.mocked(request.get);

const seedRow: AiPromptTemplate = {
  id: 1,
  code: 'customer_service',
  name: '通用客服话术',
  content: '你是{store_name}的 AI 客服,叫小服。',
  variables: '["store_name"]',
  status: 1,
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['ai-config:view', 'ai-config:create', 'ai-config:update', 'ai-config:delete'],
    } as any,
  });
});

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/ai-config/prompt']}>
        <PromptTemplatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PromptTemplatePage />', () => {
  it('列表渲染:表头 + seed 数据(code/name/变量 Tag/状态 Tag)', { timeout: 15000 }, async () => {
    mockedGet.mockResolvedValue({
      list: [seedRow],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderPage();

    // 表头
    expect(screen.getByText('Code')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('模板内容')).toBeTruthy();
    expect(screen.getByText('变量')).toBeTruthy();
    expect(screen.getByText('状态')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('customer_service')).toBeTruthy();
      expect(screen.getByText('通用客服话术')).toBeTruthy();
      expect(screen.getByText('store_name')).toBeTruthy();
      expect(screen.getByText('启用')).toBeTruthy();
    });
    expect(
      screen.getAllByText((_, el) => el?.textContent?.replace(/\s+/g, '') === '编辑').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, el) => el?.textContent?.replace(/\s+/g, '') === '删除').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('新增模板')).toBeTruthy();
  });

  it('加载中态:list 还没 resolve 时,Table 走 loading', { timeout: 15000 }, () => {
    mockedGet.mockImplementation(() => new Promise(() => {}) as ReturnType<typeof request.get>);
    renderPage();

    expect(screen.getByText('Code')).toBeTruthy();
    expect(screen.getByText('名称')).toBeTruthy();
  });

  it(
    '点击新增模板 → 打开 Drawer,可见 Code / 模板内容 / 变量列表 表单字段',
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      mockedGet.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 });
      renderPage();

      await user.click(screen.getByText('新增模板'));

      await waitFor(() => {
        expect(screen.getByText('新增 Prompt 模板')).toBeTruthy();
      });
      expect(screen.getAllByText('模板内容').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('变量列表')).toBeTruthy();
    },
  );
});
