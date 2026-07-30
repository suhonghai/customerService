import request from './request';

export interface UserListItem {
  id: number;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  departmentId: number | null;
  status: number;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { id: number; code: string; name: string }[];
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
}

export function listUsers(params: UserListParams) {
  return request.get<PageResult<UserListItem>, PageResult<UserListItem>>('/users', {
    params,
  });
}

export interface CreateUserDto {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  phone?: string;
  status?: number;
  roleIds?: number[];
}

export function createUser(data: CreateUserDto) {
  return request.post<UserListItem, UserListItem>('/users', data);
}

export interface UpdateUserDto {
  nickname?: string;
  email?: string;
  phone?: string;
  status?: number;
  password?: string;
}

export function updateUser(id: number, data: UpdateUserDto) {
  return request.put<UserListItem, UserListItem>(`/users/${id}`, data);
}

export function deleteUser(id: number) {
  return request.delete(`/users/${id}`);
}

export function resetPassword(id: number, newPassword: string) {
  return request.post(`/users/${id}/reset-password`, { newPassword });
}

export function assignRoles(id: number, roleIds: number[]) {
  return request.post(`/users/${id}/roles`, { roleIds });
}
