import request from './request';
import type { PageResult } from './session';

/**
 * AI Prompt 模板 — 与后端 ai_prompt_template 表 1:1。
 * 后端 DTO:
 *   - CreateAiPromptTemplateDto: code(2-50) / name(2-100) / content(1-8000) / variables(JSON 字符串 ≤1000) / status(0|1,默认 1)
 *   - UpdateAiPromptTemplateDto: Partial<Create>
 *   - 5 API: list / getById / create / update / delete(详见 ai-prompt-template.controller.ts)
 */
export interface AiPromptTemplate {
  id: number;
  code: string;
  name: string;
  content: string;
  /** JSON 字符串,如 '["store_name","ticket_no"]'; 后端会校验必须是 JSON 数组 */
  variables: string | null;
  status: number; // 1=启用 / 0=禁用
  createdAt: string;
  updatedAt: string;
}

export interface AiPromptTemplateListParams {
  page?: number;
  pageSize?: number;
  code?: string;
  name?: string;
  status?: number;
}

export interface CreateAiPromptTemplateDto {
  code: string;
  name: string;
  content: string;
  variables?: string;
  status?: number;
}

export type UpdateAiPromptTemplateDto = Partial<CreateAiPromptTemplateDto>;

/**
 * 解析后端 variables JSON 字符串为数组,失败返回空数组。
 * UI 在 Drawer 实时展示 / Diff 用,失败时静默退化即可(后端 create 时会再校验)。
 */
export function parseVariables(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export const aiPromptTemplateApi = {
  list: (params: AiPromptTemplateListParams = {}) =>
    request.get<PageResult<AiPromptTemplate>, PageResult<AiPromptTemplate>>(
      '/ai-prompt-templates',
      { params },
    ),
  getById: (id: number) =>
    request.get<AiPromptTemplate, AiPromptTemplate>(`/ai-prompt-templates/${id}`),
  create: (data: CreateAiPromptTemplateDto) =>
    request.post<AiPromptTemplate, AiPromptTemplate>('/ai-prompt-templates', data),
  update: (id: number, data: UpdateAiPromptTemplateDto) =>
    request.put<AiPromptTemplate, AiPromptTemplate>(`/ai-prompt-templates/${id}`, data),
  remove: (id: number) =>
    request.delete<{ id: number }, { id: number }>(`/ai-prompt-templates/${id}`),
};
