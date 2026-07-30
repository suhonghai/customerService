import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestModelModal } from './TestModelModal';
import type { AIConfig } from '@/hooks/use-ai-configs';

const cfg: AIConfig = {
  id: 1,
  code: 'qwen',
  name: 'qwen-prod',
  provider: 'dashscope',
  modelId: 'qwen3.7-plus',
  status: 1,
};

describe('<TestModelModal />', () => {
  it('renders title with config name and prompt field', () => {
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={null}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('测试 qwen-prod')).toBeTruthy();
    expect(screen.getByText('Prompt')).toBeTruthy();
    expect(screen.getByText('发送测试')).toBeTruthy();
  });

  it('default prompt is 你好', () => {
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={null}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('你好');
  });

  it('submit calls onSubmit with prompt text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={null}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.clear(ta);
    await user.type(ta, '你好世界');
    await user.click(screen.getByText('发送测试'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('你好世界'));
  });

  it('renders result block when result is provided', () => {
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={{ response: 'hi back', latencyMs: 123, tokens: 7 }}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('hi back')).toBeTruthy();
    expect(screen.getByText('123 ms')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('renders error fallback when result.error is set', () => {
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={{ error: 'rate limited' }}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('rate limited')).toBeTruthy();
  });

  it('hides result block when result is null', () => {
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={null}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByText('响应:')).toBeNull();
  });

  it('clicking the cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <TestModelModal
        open
        config={cfg}
        loading={false}
        result={null}
        onCancel={onCancel}
        onSubmit={() => {}}
      />,
    );
    // antd Modal 右上角 close 按钮 (×)
    const closeBtn = document.body.querySelector('.ant-modal-close') as HTMLElement | null;
    if (closeBtn) (closeBtn as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalled();
    // also test that user-event click works
    await user.click(closeBtn!);
    expect(onCancel.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
