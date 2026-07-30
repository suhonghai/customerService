import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Form } from 'antd';
import { PromptTemplateForm, DEFAULT_VALUES } from './PromptTemplateForm';

function Host({ editing = null as any }) {
  function Inner() {
    const [form] = Form.useForm();
    return <PromptTemplateForm form={form} editing={editing} />;
  }
  return <Inner />;
}

describe('<PromptTemplateForm />', () => {
  it('renders all expected labels', () => {
    render(<Host />);
    ['Code', '名称', '模板内容', '变量列表', '状态'].forEach((label) =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0),
    );
  });

  it('renders PromptTemplateDiff inside (null on initial empty state)', () => {
    render(<Host />);
    // 初始 content + variables 都为空 → diff 不渲染
    expect(screen.queryByTestId(/prompt-diff-/)).toBeNull();
  });

  it('code is disabled when editing', () => {
    render(<Host editing={{ id: 1 }} />);
    const codeInput = screen.getByPlaceholderText('如 customer_service') as HTMLInputElement;
    expect(codeInput.disabled).toBe(true);
  });

  it('code is enabled when creating', () => {
    render(<Host />);
    const codeInput = screen.getByPlaceholderText('如 customer_service') as HTMLInputElement;
    expect(codeInput.disabled).toBe(false);
  });
});

describe('DEFAULT_VALUES', () => {
  it('status 1 + variables []', () => {
    expect(DEFAULT_VALUES.status).toBe(1);
    expect(DEFAULT_VALUES.variables).toEqual([]);
  });
});
