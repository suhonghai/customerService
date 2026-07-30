import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDictTypes, useDictItems, useDictMutations } from './dict-hooks';
import type { DictType, DictItem } from '@/services/dict';

// Mock services/dict so we never hit axios
vi.mock('@/services/dict', () => ({
  dictApi: {
    listTypes: vi.fn(),
    getByCode: vi.fn(),
    createType: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { dictApi } from '@/services/dict';

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
});

describe('useDictTypes', () => {
  it('returns listTypes result', async () => {
    const mockTypes: DictType[] = [
      {
        id: 1,
        code: 'order_status',
        name: '订单状态',
        remark: null,
        itemCount: 0,
        activeItemCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    (dictApi.listTypes as any).mockResolvedValue(mockTypes);

    const { result } = renderHook(() => useDictTypes(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTypes);
  });
});

describe('useDictItems', () => {
  it('enabled=false when code is undefined', () => {
    const { result } = renderHook(() => useDictItems(undefined), {
      wrapper: makeWrapper(),
    });

    // 没传 code → query disabled,fetchStatus = 'idle'
    expect(result.current.fetchStatus).toBe('idle');
    expect(dictApi.getByCode).not.toHaveBeenCalled();
  });

  it('calls getByCode when code is provided', async () => {
    const mockItems: DictItem[] = [
      {
        id: 1,
        typeId: 1,
        label: '已支付',
        value: 'paid',
        sort: 1,
        isDefault: false,
        cssClass: 'green',
        remark: null,
        status: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    (dictApi.getByCode as any).mockResolvedValue(mockItems);

    const { result } = renderHook(() => useDictItems('order_status'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(dictApi.getByCode).toHaveBeenCalledWith('order_status');
    expect(result.current.data).toEqual(mockItems);
  });
});

describe('useDictMutations', () => {
  it('createType 调用 dictApi.createType + invalidate types', async () => {
    (dictApi.createType as any).mockResolvedValue({ id: 1, code: 'x', name: 'X' });

    const { result } = renderHook(() => useDictMutations(null), { wrapper: makeWrapper() });

    result.current.createType.mutate({ code: 'x', name: 'X' });

    await waitFor(() => expect(result.current.createType.isSuccess).toBe(true));
    expect(dictApi.createType).toHaveBeenCalledWith({ code: 'x', name: 'X' });
  });

  it('removeItem 调用 dictApi.removeItem', async () => {
    (dictApi.removeItem as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDictMutations(null), { wrapper: makeWrapper() });

    result.current.removeItem.mutate(42);

    await waitFor(() => expect(result.current.removeItem.isSuccess).toBe(true));
    expect(dictApi.removeItem).toHaveBeenCalledWith(42);
  });

  it('selectedType 非 null 时 createItem 正常调用 dictApi.createItem', async () => {
    const mockType: DictType = {
      id: 1,
      code: 'order_status',
      name: '订单状态',
      remark: null,
      itemCount: 0,
      activeItemCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    (dictApi.createItem as any).mockResolvedValue({ id: 99, typeId: 1, label: 'x', value: 'y' });

    const { result } = renderHook(() => useDictMutations(mockType), { wrapper: makeWrapper() });

    result.current.createItem.mutate({ label: 'x', value: 'y' });

    await waitFor(() => expect(result.current.createItem.isSuccess).toBe(true));
    expect(dictApi.createItem).toHaveBeenCalledWith('order_status', { label: 'x', value: 'y' });
  });

  it('updateItem 调用 dictApi.updateItem(剥离 id)', async () => {
    const mockType: DictType = {
      id: 1,
      code: 'order_status',
      name: '订单状态',
      remark: null,
      itemCount: 0,
      activeItemCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    (dictApi.updateItem as any).mockResolvedValue({ id: 42, label: 'updated' });

    const { result } = renderHook(() => useDictMutations(mockType), { wrapper: makeWrapper() });

    result.current.updateItem.mutate({ id: 42, label: 'updated', value: 'v2' });

    await waitFor(() => expect(result.current.updateItem.isSuccess).toBe(true));
    // updateItem 接收 { id, ...dto } → dictApi.updateItem(id, dto)
    expect(dictApi.updateItem).toHaveBeenCalledWith(42, { label: 'updated', value: 'v2' });
  });
});
