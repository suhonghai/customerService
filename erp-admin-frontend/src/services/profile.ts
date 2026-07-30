import request from './request';

export interface MeResponse {
  id: number;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  roles: { id: number; code: string; name: string }[];
  permissions: string[];
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

export const profileApi = {
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.put<{ code: number }, { code: number }>('/auth/password', data),
  getMe: () => request.get<MeResponse, MeResponse>('/auth/me'),
};
