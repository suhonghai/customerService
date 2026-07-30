import { Modal, Form, Input, Button } from 'antd';
import type { AIConfig, TestModelResult } from '@/hooks/use-ai-configs';

export interface TestModelModalProps {
  open: boolean;
  /** null 时 Modal 不渲染结果区;父级通过同步设置 editing 来实现 */
  config: AIConfig | null;
  loading: boolean;
  result: TestModelResult | null;
  onCancel: () => void;
  onSubmit: (prompt: string) => void;
}

/**
 * 测试 AI 模型弹窗 — 用户输入 prompt,点击发送后展示响应 / 延迟 / tokens。
 *
 * 不持有任何 mutation — 调用方把 testMut.isPending 和 onSubmit 传进来,
 * 组件本身只负责 Modal + Form + 结果展示。
 */
export function TestModelModal({
  open,
  config,
  loading,
  result,
  onCancel,
  onSubmit,
}: TestModelModalProps) {
  return (
    <Modal
      title={`测试 ${config?.name || ''}`}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={640}
    >
      <Form
        layout="vertical"
        onFinish={(v) => onSubmit(v.prompt)}
        initialValues={{ prompt: '你好' }}
      >
        <Form.Item
          name="prompt"
          label="Prompt"
          rules={[{ required: true, message: '请输入 prompt' }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading}>
          发送测试
        </Button>
      </Form>
      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: '#f5f5f5',
            borderRadius: 4,
          }}
        >
          <div>
            <strong>响应:</strong> {result.response || result.error || '-'}
          </div>
          {result.latencyMs !== undefined && (
            <div>
              <strong>延迟:</strong> {result.latencyMs} ms
            </div>
          )}
          {result.tokens !== undefined && (
            <div>
              <strong>Tokens:</strong> {result.tokens}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
