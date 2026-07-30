import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import request from '@/services/request';
import { useAuthStore } from '@/stores/auth';

/**
 * FAQ — 与后端 faq 表 1:1。
 *
 * UI 在 src/pages/FAQ + src/components/faq/* 渲染,
 * 这里只负责 query / mutation 封装,让组件纯展示 + 事件回调。
 */

export interface FAQVersion {
  id: number;
  version: number;
  changelog?: string;
  createdAt: string;
  creatorName?: string;
}

export interface FAQ {
  id: number;
  title: string;
  category?: string;
  tags?: string;
  currentVersion: number;
  status: number; // 0=draft 1=pending 2=published 3=offline
  createdAt: string;
  updatedAt?: string;
  creatorName?: string;
  versions?: FAQVersion[];
}

export interface FAQListParams {
  page: number;
  pageSize: number;
  status?: number;
  keyword?: string;
}

export interface FAQListResult {
  list: FAQ[];
  total: number;
  page: number;
  pageSize: number;
}

const PATH = '/faq';

function listFAQs(params: FAQListParams): Promise<FAQListResult> {
  // 后端期望扁平 query string,axios 自动序列化 params 对象
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('pageSize', String(params.pageSize));
  if (params.status !== undefined) search.set('status', String(params.status));
  if (params.keyword) search.set('keyword', params.keyword);
  return request.get<FAQListResult, FAQListResult>(`${PATH}?${search.toString()}`);
}

function getFAQ(id: number): Promise<FAQ> {
  return request.get<FAQ, FAQ>(`${PATH}/${id}`);
}

export interface FAQUploadInput {
  title: string;
  category?: string;
  tags?: string;
  file: File;
}

export interface FAQUploadOutcome {
  ok: boolean;
  message?: string;
  data?: unknown;
}

/**
 * FAQ 上传走浏览器原生 fetch(FormData + multipart),
 * 不走 axios 是因为 axios 默认 Content-Type 与 boundary 兼容性踩坑。
 *
 * 成功返回 { ok: true, data };失败返回 { ok: false, message }。
 * 由调用方负责 toast + 关闭 modal。
 */
export async function uploadFAQ(
  input: FAQUploadInput,
  token: string | null,
): Promise<FAQUploadOutcome> {
  if (!token) return { ok: false, message: '未登录,无法上传' };
  if (!input.file) return { ok: false, message: '请选择文件' };
  const fd = new FormData();
  fd.append('file', input.file);
  fd.append('title', input.title);
  if (input.category) fd.append('category', input.category);
  if (input.tags) fd.append('tags', input.tags);
  try {
    const res = await fetch('/api/faq/upload', {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (json.code !== 0) {
      return { ok: false, message: json.message || '上传失败' };
    }
    return { ok: true, data: json.data };
  } catch (e: any) {
    return { ok: false, message: e?.message || '上传失败' };
  }
}

export function useFAQList(params: FAQListParams) {
  return useQuery<FAQListResult>({
    queryKey: ['faq', params.page, params.pageSize, params.status, params.keyword],
    queryFn: () => listFAQs(params),
  });
}

export function useFAQDetail(id: number | null) {
  return useQuery({
    queryKey: ['faq', id],
    queryFn: () => getFAQ(id as number),
    enabled: id !== null,
    staleTime: 60_000,
  });
}

/**
 * 上传 FAQ:取 accessToken 后 fetch。
 * 成功 toast + invalidateQueries + 调用方关 modal。
 */
export function useUploadFAQ(opts?: { onSuccess?: () => void; onError?: (msg: string) => void }) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FAQUploadInput) => uploadFAQ(input, token),
    onSuccess: (res) => {
      if (res.ok) {
        message.success('上传成功');
        qc.invalidateQueries({ queryKey: ['faq'] });
        opts?.onSuccess?.();
      } else {
        message.error(res.message || '上传失败');
        opts?.onError?.(res.message || '上传失败');
      }
    },
  });
}

export function useReviewFAQ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'publish' | 'offline' }) =>
      request.post(`${PATH}/${id}/${action}`),
    onSuccess: (_d, vars) => {
      message.success(vars.action === 'publish' ? '已发布' : '已下线');
      qc.invalidateQueries({ queryKey: ['faq'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}

export function useDeleteFAQ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<{ id: number }, { id: number }>(`${PATH}/${id}`),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['faq'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}
