import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
});

instance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // W11 internal API 凭证:axios 自动注入
  const internalToken = import.meta.env.VITE_INTERNAL_TOKEN;
  if (internalToken) {
    config.headers['X-Internal-Token'] = internalToken;
  }
  return config;
});

// 防止并发 401 触发多次 refresh
let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  if (refreshing) return refreshing;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('no refresh token');
  refreshing = (async () => {
    try {
      const res = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
        '/api/auth/refresh',
        { refreshToken },
      );
      const data = res.data.data;
      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

instance.interceptors.response.use(
  (res) => {
    const body = res.data as ApiEnvelope;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        return Promise.reject(new Error(body.message || `请求失败(code=${body.code})`));
      }
      return body.data;
    }
    return res.data;
  },
  async (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status;
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const newToken = await doRefresh();
        original.headers = original.headers || {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return instance.request(original);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }
    const msg = error.response?.data?.message || error.message || '网络异常';
    return Promise.reject(new Error(msg));
  },
);

export default instance;
