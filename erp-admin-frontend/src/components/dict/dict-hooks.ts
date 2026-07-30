import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { dictApi, type DictType } from '@/services/dict';
import type { DictTypeFormValues } from './DictTypeFormModal';
import type { DictItemFormValues } from './DictItemFormModal';

/**
 * 字典类型列表查询。
 */
export function useDictTypes() {
  return useQuery({
    queryKey: ['dict', 'types'],
    queryFn: () => dictApi.listTypes(),
  });
}

/**
 * 字典项列表查询(按选中类型 code)。
 */
export function useDictItems(code: string | undefined) {
  return useQuery({
    queryKey: ['dict', 'items', code],
    queryFn: () => dictApi.getByCode(code!),
    enabled: !!code,
  });
}

/**
 * 字典类型 / 项 写操作 mutation 集合。
 *
 * - onSuccess 统一 invalidate ['dict', 'types'] / ['dict', 'items', code]
 * - onError 统一弹 message.error(用户消息)
 * - 返回的 setTypeModalOpen / setItemModalOpen 由调用方控制 modal 显示
 */
export function useDictMutations(selectedType: DictType | null) {
  const qc = useQueryClient();
  const itemsKey = ['dict', 'items', selectedType?.code];

  const createType = useMutation({
    mutationFn: (dto: DictTypeFormValues) => dictApi.createType(dto),
    onSuccess: () => {
      message.success('类型创建成功');
      qc.invalidateQueries({ queryKey: ['dict', 'types'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createItem = useMutation({
    mutationFn: (dto: DictItemFormValues) => dictApi.createItem(selectedType!.code, dto),
    onSuccess: () => {
      message.success('项创建成功');
      qc.invalidateQueries({ queryKey: itemsKey });
      qc.invalidateQueries({ queryKey: ['dict', 'types'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: ({ id, ...dto }: { id: number } & DictItemFormValues) =>
      dictApi.updateItem(id, dto),
    onSuccess: () => {
      message.success('项更新成功');
      qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: (id: number) => dictApi.removeItem(id),
    onSuccess: () => {
      message.success('项删除成功');
      qc.invalidateQueries({ queryKey: itemsKey });
      qc.invalidateQueries({ queryKey: ['dict', 'types'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return { createType, createItem, updateItem, removeItem };
}
