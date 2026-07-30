import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import request from '@/services/request';

vi.mock('@/services/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { useFAQList, useReviewFAQ, useDeleteFAQ, uploadFAQ } from './use-faqs';

const mockedRequest = vi.mocked(request);

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFAQList', () => {
  it('calls GET /faq with flat query string', async () => {
    mockedRequest.get.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 });
    const { result } = renderHook(
      () => useFAQList({ page: 1, pageSize: 20, status: 2, keyword: 'hi' }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.get).toHaveBeenCalledWith('/faq?page=1&pageSize=20&status=2&keyword=hi');
  });

  it('omits undefined status and empty keyword', async () => {
    mockedRequest.get.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 });
    const { result } = renderHook(() => useFAQList({ page: 2, pageSize: 10 }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.get).toHaveBeenCalledWith('/faq?page=2&pageSize=10');
  });
});

describe('useReviewFAQ', () => {
  it('POSTs /faq/:id/publish', async () => {
    mockedRequest.post.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useReviewFAQ(), { wrapper: wrap() });
    act(() => {
      result.current.mutate({ id: 5, action: 'publish' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith('/faq/5/publish');
  });

  it('POSTs /faq/:id/offline', async () => {
    mockedRequest.post.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useReviewFAQ(), { wrapper: wrap() });
    act(() => {
      result.current.mutate({ id: 7, action: 'offline' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith('/faq/7/offline');
  });
});

describe('useDeleteFAQ', () => {
  it('DELETEs /faq/:id', async () => {
    mockedRequest.delete.mockResolvedValue({ id: 9 });
    const { result } = renderHook(() => useDeleteFAQ(), { wrapper: wrap() });
    act(() => {
      result.current.mutate(9);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.delete).toHaveBeenCalledWith('/faq/9');
  });
});

describe('uploadFAQ', () => {
  it('returns ok=false when token is null', async () => {
    const res = await uploadFAQ({ title: 't', file: {} as File }, null);
    expect(res.ok).toBe(false);
  });

  it('returns ok=false when file is missing', async () => {
    const res = await uploadFAQ({ title: 't', file: undefined as any }, 'tok');
    expect(res.ok).toBe(false);
  });

  it('posts FormData and returns ok=true on code 0', async () => {
    const fakeFetch = vi.fn(async () => ({
      json: async () => ({ code: 0, data: { id: 1 } }),
    })) as any;
    globalThis.fetch = fakeFetch;
    const fakeFile = new File(['hi'], 'faq.md', { type: 'text/markdown' });
    const res = await uploadFAQ({ title: 't', category: 'c', tags: 'a,b', file: fakeFile }, 'tok');
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: 1 });
    expect(fakeFetch).toHaveBeenCalledWith(
      '/api/faq/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    const fd = fakeFetch.mock.calls[0][1].body as FormData;
    expect(fd.get('title')).toBe('t');
    expect(fd.get('category')).toBe('c');
    expect(fd.get('tags')).toBe('a,b');
    // FormData 在 jsdom 下 .get('file') 返回 File 实例,断言名字一致即可
    expect((fd.get('file') as File).name).toBe('faq.md');
  });

  it('returns ok=false on non-zero code', async () => {
    globalThis.fetch = vi.fn(async () => ({
      json: async () => ({ code: 1, message: 'bad file' }),
    })) as any;
    const res = await uploadFAQ({ title: 't', file: {} as File }, 'tok');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('bad file');
  });

  it('returns ok=false on network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as any;
    const res = await uploadFAQ({ title: 't', file: {} as File }, 'tok');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('network');
  });
});
