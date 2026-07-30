import type { ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * 给 layouts/ 子组件测试用的最小 Provider 包装:
 * - MemoryRouter(默认 initialEntries=['/'],可覆盖)
 * - QueryClientProvider(给 useQueryClient / useQuery 用)
 *
 * 主题/ConfigProvider 不包(避免引入 antd 主题 token 复杂行为)
 */
export function renderWithProviders(
  ui: ReactNode,
  options: { initialEntries?: string[] } & RenderOptions = {},
): RenderResult {
  const { initialEntries = ['/'], ...rest } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
    rest,
  );
}
