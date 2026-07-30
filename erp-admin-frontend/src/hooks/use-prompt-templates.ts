import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import request from '@/services/request';
import type {
  AiPromptTemplate,
  AiPromptTemplateListParams,
  CreateAiPromptTemplateDto,
} from '@/services/ai-prompt-template';

/**
 * AI Prompt 模板 hooks — 与 services/ai-prompt-template 共用 DTO,
 * 这里只补 query / mutation 封装(toast + invalidate)给 page / 组件用。
 *
 * 后端路径:`/ai-prompt-templates`,see services/ai-prompt-template.ts。
 */

const PATH = '/ai-prompt-templates';

export interface PromptTemplateListResult {
  list: AiPromptTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

function listTemplates(params: AiPromptTemplateListParams): Promise<PromptTemplateListResult> {
  return request.get(PATH, { params });
}

export function usePromptTemplateList(params: AiPromptTemplateListParams) {
  return useQuery<PromptTemplateListResult>({
    queryKey: ['ai-prompt-templates', params],
    queryFn: () => listTemplates(params),
  });
}

export function useCreatePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAiPromptTemplateDto) =>
      request.post<AiPromptTemplate, AiPromptTemplate>(PATH, dto),
    onSuccess: () => {
      message.success('创建成功');
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}

export function useUpdatePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number } & CreateAiPromptTemplateDto) => {
      const { id, ...dto } = vars;
      return request.put<AiPromptTemplate, AiPromptTemplate>(`${PATH}/${id}`, dto);
    },
    onSuccess: () => {
      message.success('更新成功');
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}

export function useDeletePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<{ id: number }, { id: number }>(`${PATH}/${id}`),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
}
