import request from './request';

export interface DictType {
  id: number;
  code: string;
  name: string;
  remark: string | null;
  itemCount: number;
  activeItemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DictItem {
  id: number;
  typeId: number;
  label: string;
  value: string;
  sort: number;
  isDefault: boolean;
  cssClass: string | null;
  remark: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export const dictApi = {
  listTypes: () => request.get<DictType[], DictType[]>('/dicts/types'),
  getByCode: (code: string) => request.get<DictItem[], DictItem[]>(`/dicts/${code}`),
  createType: (data: any) => request.post<DictType, DictType>('/dicts/types', data),
  createItem: (code: string, data: any) =>
    request.post<DictItem, DictItem>(`/dicts/${code}/items`, data),
  updateItem: (id: number, data: any) =>
    request.put<DictItem, DictItem>(`/dicts/items/${id}`, data),
  removeItem: (id: number) => request.delete(`/dicts/items/${id}`),
};
