import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useTicketListQuery,
  useTicketStatsQuery,
  useAssignTicket,
  useUpdateTicketStatus,
  useReplyTicket,
  fetchTicketDetail,
} from './use-tickets';

// mock request service,绕开 axios
vi.mock('@/services/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import request from '@/services/request';
const mockedGet = vi.mocked(request.get);
const mockedPost = vi.mocked(request.post);
const mockedPut = vi.mocked(request.put);

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, qc };
}

describe('use-tickets hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useTicketListQuery fetches /tickets with filter params', async () => {
    mockedGet.mockResolvedValueOnce({ list: [{ id: 1 }], total: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useTicketListQuery({
          page: 1,
          pageSize: 20,
          status: 2,
          priority: 3,
          keyword: 'login',
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGet).toHaveBeenCalledWith(
      '/tickets?page=1&pageSize=20&status=2&priority=3&keyword=login',
    );
    expect(result.current.data).toEqual({ list: [{ id: 1 }], total: 1 });
  });

  it('useTicketListQuery omits undefined filters', async () => {
    mockedGet.mockResolvedValueOnce({ list: [], total: 0 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useTicketListQuery({
          page: 2,
          pageSize: 10,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGet).toHaveBeenCalledWith('/tickets?page=2&pageSize=10');
  });

  it('useTicketStatsQuery fetches /tickets/stats', async () => {
    mockedGet.mockResolvedValueOnce({ total: 100 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTicketStatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGet).toHaveBeenCalledWith('/tickets/stats');
    expect(result.current.data).toEqual({ total: 100 });
  });

  it('useAssignTicket POSTs /tickets/:id/assign and invalidates queries', async () => {
    mockedPost.mockResolvedValueOnce({ ok: true });
    const { wrapper, qc } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useAssignTicket(), { wrapper });
    result.current.mutate({ id: 7, assigneeId: 99 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPost).toHaveBeenCalledWith('/tickets/7/assign', { assigneeId: 99 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tickets'] });
  });

  it('useUpdateTicketStatus PUTs /tickets/:id/status', async () => {
    mockedPut.mockResolvedValueOnce({ ok: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateTicketStatus(), { wrapper });
    result.current.mutate({ id: 11, status: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPut).toHaveBeenCalledWith('/tickets/11/status', { status: 3 });
  });

  it('useReplyTicket POSTs /tickets/:id/reply with content', async () => {
    mockedPost.mockResolvedValueOnce({ ok: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReplyTicket(), { wrapper });
    result.current.mutate({ id: 5, content: 'thanks' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPost).toHaveBeenCalledWith('/tickets/5/reply', { content: 'thanks' });
  });

  it('fetchTicketDetail calls GET /tickets/:id', async () => {
    mockedGet.mockResolvedValueOnce({ id: 99, description: 'detail' });
    const detail = await fetchTicketDetail(99);
    expect(mockedGet).toHaveBeenCalledWith('/tickets/99');
    expect(detail).toEqual({ id: 99, description: 'detail' });
  });
});
