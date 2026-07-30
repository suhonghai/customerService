import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import request from '@/services/request';

/**
 * AI 模型配置 — 与后端 ai_config 表 1:1。
 *
 * UI 在 src/pages/AIConfig + src/components/aiconfig/* 渲染,
 * 这里只负责 query / mutation 封装,让组件纯展示 + 事件回调。
 */

export interface AIConfig {
  id: number;
  code: string;
  name: string;
  provider: 'dashscope' | 'openai' | 'minimax' | string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  isDefault?: boolean;
  status: 0 | 1;
  createdAt?: string;
  updatedAt?: string;
}

export interface AIConfigListParams {
  page: number;
  pageSize: number;
}

export interface AIConfigListResult {
  list: AIConfig[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAIConfigDto {
  code: string;
  name: string;
  provider: string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  isDefault?: boolean;
  status?: 0 | 1;
}

export type UpdateAIConfigDto = Partial<CreateAIConfigDto>;

const PATH = '/ai-configs';

function listConfigs(params: AIConfigListParams): Promise<AIConfigListResult> {
  return request.get<AIConfigListResult, AIConfigListResult>(PATH, { params });
}

function createConfig(dto: CreateAIConfigDto): Promise<AIConfig> {
  return request.post<AIConfig, AIConfig>(PATH, dto);
}

function updateConfig(id: number, dto: UpdateAIConfigDto): Promise<AIConfig> {
  return request.put<AIConfig, AIConfig>(`${PATH}/${id}`, dto);
}

function deleteConfig(id: number): Promise<{ id: number }> {
  return request.delete<{ id: number }, { id: number }>(`${PATH}/${id}`);
}

function setDefault(id: number): Promise<AIConfig> {
  return request.post<AIConfig, AIConfig>(`${PATH}/${id}/set-default`);
}

export interface TestModelPayload {
  id: number;
  prompt: string;
}

export interface TestModelResult {
  response?: string;
  error?: string;
  latencyMs?: number;
  tokens?: number;
}

function testModel(payload: TestModelPayload): Promise<TestModelResult> {
  return request.post<TestModelResult, TestModelResult>(`${PATH}/${payload.id}/test`, {
    prompt: payload.prompt,
  });
}

/**
 * AIConfig page 的 query / mutation 封装。
 *
 * - `useAIConfigList(params)` — 拉列表
 * - `useCreateAIConfig()`    — 新增配置
 * - `useUpdateAIConfig()`    — 更新配置
 * - `useDeleteAIConfig()`    — 删除配置
 * - `useSetDefaultAIConfig()` — 设为默认
 * - `useTestAIModel()`       — 触发测试并返回响应
 */
export function useAIConfigList(params: AIConfigListParams) {
  return useQuery<AIConfigListResult>({
    queryKey: ['ai-configs', params.page, params.pageSize],
    queryFn: () => listConfigs(params),
  });
}

function onSuccess(qc: ReturnType<typeof useQueryClient>, msg: string) {
  return () => {
    message.success(msg);
    qc.invalidateQueries({ queryKey: ['ai-configs'] });
  };
}

export function useCreateAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAIConfigDto) => createConfig(dto),
    onSuccess: onSuccess(qc, '创建成功'),
    onError: (e: Error) => message.error(e.message),
  });
}

export function useUpdateAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateAIConfigDto }) => updateConfig(id, dto),
    onSuccess: onSuccess(qc, '更新成功'),
    onError: (e: Error) => message.error(e.message),
  });
}

export function useDeleteAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteConfig(id),
    onSuccess: onSuccess(qc, '删除成功'),
    onError: (e: Error) => message.error(e.message),
  });
}

export function useSetDefaultAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => setDefault(id),
    onSuccess: onSuccess(qc, '设为默认成功'),
    onError: (e: Error) => message.error(e.message),
  });
}

export function useTestAIModel() {
  return useMutation({
    mutationFn: (payload: TestModelPayload) => testModel(payload),
    onError: (e: Error) => message.error(e.message),
  });
}
