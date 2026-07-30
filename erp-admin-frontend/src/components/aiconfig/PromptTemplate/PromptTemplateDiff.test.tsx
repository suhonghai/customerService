import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Form, Input, Select } from 'antd';
import { PromptTemplateDiff } from './PromptTemplateDiff';

function makeFormHost() {
  function Host({ initialContent = '', initialVars = [] as string[] }) {
    const [form] = Form.useForm();
    return (
      <Form
        form={form}
        layout="vertical"
        initialValues={{ content: initialContent, variables: initialVars }}
      >
        <Form.Item name="content">
          <Input.TextArea data-testid="content-input" />
        </Form.Item>
        <Form.Item name="variables">
          <Select mode="tags" data-testid="vars-select" />
        </Form.Item>
        <PromptTemplateDiff form={form} />
      </Form>
    );
  }
  return Host;
}

describe('<PromptTemplateDiff />', () => {
  it('renders nothing when content + variables are both empty', () => {
    const Host = makeFormHost();
    render(<Host />);
    expect(screen.queryByTestId(/prompt-diff-/)).toBeNull();
  });

  it('renders warning when content has vars that are not declared', async () => {
    const Host = makeFormHost();
    render(<Host />);
    const ta = screen.getByTestId('content-input') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '你是 {store_name} 的 AI' } });
    await waitFor(() => expect(screen.getByTestId('prompt-diff-warning')).toBeTruthy());
    expect(screen.getByText('store_name')).toBeTruthy();
  });

  it('renders info when declared vars are not used in content', async () => {
    const Host = makeFormHost();
    render(<Host initialContent="hello" initialVars={['extra']} />);
    await waitFor(() => expect(screen.getByTestId('prompt-diff-info')).toBeTruthy());
    // 「extra」 出现在 Select tag 和 Alert tag;用 getAllByText
    expect(screen.getAllByText('extra').length).toBeGreaterThan(0);
  });

  it('renders success when content uses exactly the declared vars', async () => {
    const Host = makeFormHost();
    render(<Host initialContent="hi {x}" initialVars={['x']} />);
    await waitFor(() => expect(screen.getByTestId('prompt-diff-success')).toBeTruthy());
    expect(screen.getByText('变量声明完整(1 个): x')).toBeTruthy();
  });
});
