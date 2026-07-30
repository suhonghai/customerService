import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useOrderList, useUpdateStatus, useRefundOrder, exportOrdersToCsv } from './use-orders';
import { useAuthStore } from '@/stores/auth';

// Mock services/order so we never hit axios
vi.mock('@/services/order', () => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  updateStatus: vi.fn(),
  refund: vi.fn(),
  exportOrdersUrl: vi.fn((p: any) => `/api/orders/export?q=${JSON.stringify(p)}`),
}));

import { listOrders, updateStatus, refund } from '@/services/order';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 auth store 是空 token,避免污染
  useAuthStore.setState({ accessToken: null, refreshToken: null });
});

describe('use-orders', () => {
  it('useOrderList fetches and caches list via react-query', async () => {
    const fakeData = { list: [{ id: 1, orderNo: 'A1' } as any], total: 1, page: 1, pageSize: 20 };
    (listOrders as any).mockResolvedValueOnce(fakeData);

    const { result } = renderHook(() => useOrderList({ page: 1, pageSize: 20 }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fakeData);
    expect(listOrders).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('useOrderList exposes error on rejection', async () => {
    (listOrders as any).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useOrderList({ page: 1 }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('boom');
  });

  it('useUpdateStatus mutation calls updateStatus and invalidates orders', async () => {
    (updateStatus as any).mockResolvedValueOnce({ ok: true });
    // 拿到一个共享 qc,通过 wrapper + 真实 invalidation
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    // 预先塞一个 orders 查询
    qc.setQueryData(['orders', { page: 1 }], { list: [], total: 0 });

    const { result } = renderHook(() => useUpdateStatus(), { wrapper });

    result.current.mutate({ id: 7, dto: { newStatus: 2 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateStatus).toHaveBeenCalledWith(7, { newStatus: 2 });
  });

  it('useRefundOrder mutation calls refund', async () => {
    (refund as any).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useRefundOrder(), { wrapper: makeWrapper() });

    result.current.mutate({ id: 9, dto: { refundAmount: 10, reason: 'test' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(refund).toHaveBeenCalledWith(9, { refundAmount: 10, reason: 'test' });
  });

  it('exportOrdersToCsv returns ok=false when no token', async () => {
    const res = await exportOrdersToCsv({ page: 1 }, null);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/未登录/);
  });

  it('exportOrdersToCsv downloads via fetch+blob when token present', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createUrl = vi.fn(() => 'blob:fake');
    const revokeUrl = vi.fn();
    // @ts-expect-error override for test
    global.URL.createObjectURL = createUrl;
    // @ts-expect-error override for test
    global.URL.revokeObjectURL = revokeUrl;

    const fakeBlob = new Blob(['a,b,c'], { type: 'text/csv' });
    (global as any).fetch = vi.fn().mockResolvedValueOnce({ blob: async () => fakeBlob });

    const res = await exportOrdersToCsv({ page: 1 }, 'tok-123');
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/export'),
      expect.objectContaining({ headers: { Authorization: 'Bearer tok-123' } }),
    );
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});
