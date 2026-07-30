import request from './request';
import type { UserInfo } from '@/stores/auth';

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: number;
    username: string;
    nickname: string;
    avatar: string | null;
    roles: { id: number; code: string; name: string }[];
    permissions: string[];
  };
}

export function login(data: LoginParams) {
  return request.post<LoginResult, LoginResult>('/auth/login', data);
}

export function fetchMe() {
  return request.get<UserInfo, UserInfo>('/auth/me');
}

export function refresh(refreshToken: string) {
  return request.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
    refreshToken,
  });
}

export function logout() {
  return request.post('/auth/logout');
}
