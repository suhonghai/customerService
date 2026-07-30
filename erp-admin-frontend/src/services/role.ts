import request from './request';

export interface RoleListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  dataScope: number;
  customDeptIds: number[] | null;
  sort: number;
  status: number;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoleListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export function listRoles(params: RoleListParams) {
  return request.get<PageResult<RoleListItem>, PageResult<RoleListItem>>('/roles', {
    params,
  });
}

export interface CreateRoleDto {
  code: string;
  name: string;
  description?: string;
  dataScope?: number;
  sort?: number;
  status?: number;
}

export function createRole(data: CreateRoleDto) {
  return request.post<RoleListItem, RoleListItem>('/roles', data);
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  dataScope?: number;
  sort?: number;
  status?: number;
}

export function updateRole(id: number, data: UpdateRoleDto) {
  return request.put<RoleListItem, RoleListItem>(`/roles/${id}`, data);
}

export function deleteRole(id: number) {
  return request.delete(`/roles/${id}`);
}

export function getRoleMenus(id: number) {
  return request.get<number[], number[]>(`/roles/${id}/menus`);
}

export function assignMenus(id: number, menuIds: number[]) {
  return request.put(`/roles/${id}/menus`, { menuIds });
}
