import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { AIConfigForm, DEFAULT_VALUES } from './AIConfigForm';
import type { CreateAIConfigDto } from '@/hooks/use-ai-configs';

async function waitForValue(getter: () => string, expected: string) {
  await waitFor(() => expect(getter()).toBe(expected));
}

function wrapForm(editing: any = null) {
  function FormHost() {
    const [form] = Form.useForm<CreateAIConfigDto>();
    return (
      <Form form={form} layout="vertical">
        <AIConfigForm form={form} editing={editing} />
      </Form>
    );
  }
  return { FormHost };
}

describe('<AIConfigForm />', () => {
  it('renders all expected field labels', () => {
    const { FormHost } = wrapForm();
    render(<FormHost />);
    [
      '代码',
      '名称',
      'Provider',
      'Model ID',
      'API Key',
      'Temperature',
      'Top P',
      'Max Tokens',
      '设为默认',
      '状态',
    ].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it('code is disabled in edit mode', () => {
    const { FormHost } = wrapForm({ id: 1, code: 'qwen' });
    render(<FormHost />);
    const codeInput = screen.getByPlaceholderText('如 qwen3.7-plus-prod') as HTMLInputElement;
    expect(codeInput.disabled).toBe(true);
  });

  it('code is enabled in create mode', () => {
    const { FormHost } = wrapForm();
    render(<FormHost />);
    const codeInput = screen.getByPlaceholderText('如 qwen3.7-plus-prod') as HTMLInputElement;
    expect(codeInput.disabled).toBe(false);
  });

  it('API Key placeholder changes in edit mode (留空不修改)', () => {
    const { FormHost } = wrapForm({ id: 1 });
    render(<FormHost />);
    // antd Password 用一个 wrapper input;placeholder 通过 search 找
    expect(screen.getAllByPlaceholderText('留空不修改').length).toBeGreaterThan(0);
  });

  it('typing into code field updates form value', async () => {
    const user = userEvent.setup();
    let readForm: any = null;
    function ReadCode() {
      const code = Form.useWatch('code', readForm);
      return <span data-testid="code-value">{code ?? ''}</span>;
    }
    function Host() {
      const [form] = Form.useForm<CreateAIConfigDto>();
      readForm = form;
      return (
        <>
          <Form form={form} layout="vertical">
            <AIConfigForm form={form} editing={null} />
          </Form>
          <ReadCode />
        </>
      );
    }
    render(<Host />);
    const codeInput = screen.getByPlaceholderText('如 qwen3.7-plus-prod') as HTMLInputElement;
    await user.type(codeInput, 'my-code');
    // useWatch 是 reactive 的
    await waitForValue(() => screen.getByTestId('code-value').textContent, 'my-code');
  });
});

describe('DEFAULT_VALUES', () => {
  it('has the expected seed values for new config', () => {
    expect(DEFAULT_VALUES.provider).toBe('dashscope');
    expect(DEFAULT_VALUES.temperature).toBe(0.7);
    expect(DEFAULT_VALUES.topP).toBe(0.8);
    expect(DEFAULT_VALUES.maxTokens).toBe(2000);
    expect(DEFAULT_VALUES.status).toBe(1);
    expect(DEFAULT_VALUES.isDefault).toBe(false);
  });
});
