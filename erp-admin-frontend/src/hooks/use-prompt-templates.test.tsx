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
  usePromptTemplateList,
  useCreatePromptTemplate,
  useUpdatePromptTemplate,
  useDeletePromptTemplate,
} from './use-prompt-templates';

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

const seedRow = {
  id: 1,
  code: 'cs',
  name: 'CS',
  content: 'hi',
  variables: '[]',
  status: 1,
  createdAt: '2026-07-16',
  updatedAt: '2026-07-16',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePromptTemplateList', () => {
  it('calls GET /ai-prompt-templates with params', async () => {
    mockedRequest.get.mockResolvedValue({ list: [seedRow], total: 1, page: 1, pageSize: 20 });
    const { result } = renderHook(() => usePromptTemplateList({ page: 1, pageSize: 20 }), {
      wrapper: wrap(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.get).toHaveBeenCalledWith('/ai-prompt-templates', {
      params: { page: 1, pageSize: 20 },
    });
    expect(result.current.data?.total).toBe(1);
  });
});

describe('useCreatePromptTemplate', () => {
  it('POSTs dto and invalidates list', async () => {
    mockedRequest.post.mockResolvedValue(seedRow as any);
    const { result } = renderHook(() => useCreatePromptTemplate(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate({
        code: 'cs',
        name: 'CS',
        content: 'hi',
        variables: '[]',
        status: 1,
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.post).toHaveBeenCalledWith(
      '/ai-prompt-templates',
      expect.objectContaining({ code: 'cs' }),
    );
  });
});

describe('useUpdatePromptTemplate', () => {
  it('PUTs /ai-prompt-templates/:id with dto (flat shape)', async () => {
    mockedRequest.put.mockResolvedValue({ ...seedRow, name: 'updated' } as any);
    const { result } = renderHook(() => useUpdatePromptTemplate(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate({
        id: 5,
        code: 'cs',
        name: 'updated',
        content: 'hi',
        variables: '[]',
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.put).toHaveBeenCalledWith('/ai-prompt-templates/5', {
      code: 'cs',
      name: 'updated',
      content: 'hi',
      variables: '[]',
    });
  });
});

describe('useDeletePromptTemplate', () => {
  it('DELETEs /ai-prompt-templates/:id', async () => {
    mockedRequest.delete.mockResolvedValue({ id: 9 } as any);
    const { result } = renderHook(() => useDeletePromptTemplate(), { wrapper: wrap() });
    await act(async () => {
      result.current.mutate(9);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRequest.delete).toHaveBeenCalledWith('/ai-prompt-templates/9');
  });
});
