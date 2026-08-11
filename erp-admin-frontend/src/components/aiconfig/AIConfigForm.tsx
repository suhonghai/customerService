import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { AIConfig, CreateAIConfigDto } from '@/hooks/use-ai-configs';

export interface AIConfigFormProps {
  form: FormInstance<CreateAIConfigDto>;
  /** 编辑模式下:code 不可改 + apiKey 可留空(留空 = 不修改) */
  editing: AIConfig | null;
}

/**
 * 新增 / 编辑 AI 配置 — 通用 Form 字段。
 *
 * - `code` 在编辑时 disabled(后端 code 是稳定标识,改 code 会破坏引用)
 * - `apiKey` 在编辑时不 required(留空 = 不修改)
 * - 默认值:`provider=dashscope, temperature=0.7, topP=0.8, maxTokens=2000, status=1, isDefault=false`
 *
 * 提交按钮 + Modal 包装由调用方负责(页面 / 表单 modal),这里只渲染字段。
 */
export const DEFAULT_VALUES: Partial<CreateAIConfigDto> = {
  provider: 'dashscope',
  temperature: 0.7,
  topP: 0.8,
  maxTokens: 2000,
  status: 1,
  isDefault: false,
};

export function AIConfigForm({ form, editing }: AIConfigFormProps) {
  return (
    <Form form={form} layout="vertical">
      <Form.Item name="code" label="代码" rules={[{ required: true, message: '请输入代码' }]}>
        <Input disabled={!!editing} placeholder="如 qwen3.7-plus-prod" />
      </Form.Item>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="provider"
        label="Provider"
        rules={[{ required: true, message: '请选择 provider' }]}
      >
        <Select
          options={[
            { value: 'dashscope', label: 'dashscope' },
            { value: 'openai', label: 'openai' },
            { value: 'minimax', label: 'minimax' },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="modelId"
        label="Model ID (对话)"
        rules={[{ required: true, message: '请输入 model id' }]}
        tooltip="用于聊天 / RAG answer 生成的模型,如 qwen3.7-plus"
      >
        <Input placeholder="qwen3.7-plus" />
      </Form.Item>
      <Form.Item
        name="embedModel"
        label="Embed Model (向量)"
        tooltip="用于 FAQ / 文档 embedding 的模型。留空 → 降级 env EMBED_MODEL,再降级 text-embedding-v4。同 provider 的 apiKey / baseUrl 可与对话模型共用,但 embedding 必须按类目配,跨类目 OpenAI compat mode 会 404"
      >
        <Input placeholder="text-embedding-v4 (留空走 env)" />
      </Form.Item>
      <Form.Item
        name="apiKey"
        label="API Key"
        rules={[{ required: !editing, message: '请输入 API Key' }]}
      >
        <Input.Password placeholder={editing ? '留空不修改' : ''} />
      </Form.Item>
      <Form.Item name="temperature" label="Temperature">
        <InputNumber min={0} max={2} step={0.1} />
      </Form.Item>
      <Form.Item name="topP" label="Top P">
        <InputNumber min={0} max={1} step={0.1} />
      </Form.Item>
      <Form.Item name="maxTokens" label="Max Tokens">
        <InputNumber min={100} max={32000} />
      </Form.Item>
      <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
        <Switch />
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
