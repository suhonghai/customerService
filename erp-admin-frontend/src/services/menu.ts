import request from './request';
import type { MenuNode } from '@/stores/menu';

export function fetchMenuTree() {
  return request.get<MenuNode[], MenuNode[]>('/menus/tree');
}

export interface MenuListItem {
  id: number;
  parentId: number | null;
  name: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  type: 1 | 2 | 3;
  permCode: string | null;
  sort: number;
  visible: boolean;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export function listMenus(params: MenuListParams) {
  return request.get<MenuListItem[], MenuListItem[]>('/menus', { params });
}

export interface CreateMenuDto {
  parentId?: number | null;
  name: string;
  path?: string;
  component?: string;
  icon?: string;
  type: 1 | 2 | 3;
  permCode?: string;
  sort?: number;
  visible?: boolean;
  status?: number;
}

export function createMenu(data: CreateMenuDto) {
  return request.post<MenuListItem, MenuListItem>('/menus', data);
}

export interface UpdateMenuDto {
  parentId?: number | null;
  name?: string;
  path?: string;
  component?: string;
  icon?: string;
  type?: 1 | 2 | 3;
  permCode?: string;
  sort?: number;
  visible?: boolean;
  status?: number;
}

export function updateMenu(id: number, data: UpdateMenuDto) {
  return request.put<MenuListItem, MenuListItem>(`/menus/${id}`, data);
}

export function deleteMenu(id: number) {
  return request.delete(`/menus/${id}`);
}
