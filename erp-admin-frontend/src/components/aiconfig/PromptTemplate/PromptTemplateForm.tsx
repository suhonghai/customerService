import { Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { AiPromptTemplate, CreateAiPromptTemplateDto } from '@/services/ai-prompt-template';
import { PromptTemplateDiff } from './PromptTemplateDiff';

export interface PromptTemplateFormProps {
  form: FormInstance<CreateAiPromptTemplateDto & { variables: string[] }>;
  /** 编辑模式下:code 不可改 */
  editing: AiPromptTemplate | null;
}

/**
 * 新增 / 编辑 Prompt 模板 — 通用 Form 字段。
 *
 * - `code` 在编辑时 disabled(后端 code 是稳定标识)
 * - `content` 用 TextArea 展示 + 提示语法 `{var_name}`
 * - `variables` 用 Select mode=tags 让用户按回车添加变量名
 * - `<PromptTemplateDiff />` 嵌在 content / variables 之间实时提示 diff
 */
export const DEFAULT_VALUES = {
  status: 1 as const,
  variables: [] as string[],
};

export function PromptTemplateForm({ form, editing }: PromptTemplateFormProps) {
  return (
    <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES}>
      <Form.Item
        name="code"
        label="Code"
        rules={[{ required: true, min: 2, max: 50, message: '2-50 字符' }]}
      >
        <Input disabled={!!editing} placeholder="如 customer_service" />
      </Form.Item>
      <Form.Item
        name="name"
        label="名称"
        rules={[{ required: true, min: 2, max: 100, message: '2-100 字符' }]}
      >
        <Input placeholder="如 通用客服话术" />
      </Form.Item>
      <Form.Item
        name="content"
        label="模板内容"
        extra="用 {var_name} 插入变量,例如:你是{store_name}的 AI 助手"
        rules={[{ required: true, min: 1, max: 8000 }]}
      >
        <Input.TextArea rows={8} placeholder="支持 {var_name} 占位符" />
      </Form.Item>

      <PromptTemplateDiff form={form} />

      <Form.Item
        name="variables"
        label="变量列表"
        extra="按回车添加,会作为模板的「声明变量」供后端记录与下游使用"
      >
        <Select
          mode="tags"
          placeholder="按回车添加变量名,如 store_name"
          tokenSeparators={[',', ' ', '\n']}
        />
      </Form.Item>

      <Form.Item name="status" label="状态">
        <Select
          options={[
            { value: 1, label: '启用' },
            { value: 0, label: '禁用' },
          ]}
        />
      </Form.Item>
    </Form>
  );
}
