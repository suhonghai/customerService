import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import request from '@/services/request';

vi.mock('@/services/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  useAIConfigList,
  useCreateAIConfig,
  useUpdateAIConfig,
  useDeleteAIConfig,
  useSetDefaultAIConfig,
  useTestAIModel,
} from './use-ai-configs';

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

describe('useAIConfigList', () => {
  it('calls GET /ai-configs with flattened params', async () => {
    mockedRequest.get.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    const { result } = renderHook(() => useAIConfigList({ page: 2, pageSize: 50 }), {
      wrapper: wrap(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.get).toHaveBeenCalledWith('/ai-configs', {
      params: { page: 2, pageSize: 50 },
    });
  });

  it('exposes list + total from response', async () => {
    mockedRequest.get.mockResolvedValue({
      list: [{ id: 1, code: 'a', name: 'A', provider: 'dashscope', modelId: 'm', status: 1 }],
      total: 7,
      page: 1,
      pageSize: 20,
    });
    const { result } = renderHook(() => useAIConfigList({ page: 1, pageSize: 20 }), {
      wrapper: wrap(),
    });
    await waitFor(() => expect(result.current.data?.total).toBe(7));
    expect(result.current.data?.list).toHaveLength(1);
  });
});

describe('useCreateAIConfig', () => {
  it('POSTs and reaches success state', async () => {
    mockedRequest.post.mockResolvedValue({ id: 1 } as any);
    const { result } = renderHook(() => useCreateAIConfig(), { wrapper: wrap() });
    act(() => {
      result.current.mutate({ code: 'a', name: 'A', provider: 'dashscope', modelId: 'm' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith(
      '/ai-configs',
      expect.objectContaining({ code: 'a' }),
    );
  });

  it('captures error message on failure', async () => {
    // mock message.error 把 antd App context 缺失的影响排除掉
    const { message } = await import('antd');
    const errSpy = vi.spyOn(message, 'error').mockImplementation(() => 1 as any);
    mockedRequest.post.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCreateAIConfig(), { wrapper: wrap() });
    result.current.mutate({ code: 'a', name: 'A', provider: 'dashscope', modelId: 'm' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('boom');
    expect(errSpy).toHaveBeenCalledWith('boom');
    errSpy.mockRestore();
  });
});

describe('useUpdateAIConfig', () => {
  it('PUTs to /ai-configs/:id', async () => {
    mockedRequest.put.mockResolvedValue({ id: 5 } as any);
    const { result } = renderHook(() => useUpdateAIConfig(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate({ id: 5, dto: { name: 'new' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.put).toHaveBeenCalledWith('/ai-configs/5', { name: 'new' });
  });
});

describe('useDeleteAIConfig', () => {
  it('DELETEs /ai-configs/:id', async () => {
    mockedRequest.delete.mockResolvedValue({ id: 7 } as any);
    const { result } = renderHook(() => useDeleteAIConfig(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate(7);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.delete).toHaveBeenCalledWith('/ai-configs/7');
  });
});

describe('useSetDefaultAIConfig', () => {
  it('POSTs /ai-configs/:id/set-default', async () => {
    mockedRequest.post.mockResolvedValue({ id: 9 } as any);
    const { result } = renderHook(() => useSetDefaultAIConfig(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate(9);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith('/ai-configs/9/set-default');
  });
});

describe('useTestAIModel', () => {
  it('POSTs /ai-configs/:id/test with prompt', async () => {
    mockedRequest.post.mockResolvedValue({ response: 'hi', latencyMs: 12 });
    const { result } = renderHook(() => useTestAIModel(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate({ id: 3, prompt: '你好' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith('/ai-configs/3/test', {
      prompt: '你好',
    });
    expect(result.current.data).toEqual({ response: 'hi', latencyMs: 12 });
  });
});
