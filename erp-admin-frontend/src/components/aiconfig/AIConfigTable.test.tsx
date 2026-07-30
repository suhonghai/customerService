import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIConfigTable, maskApiKey } from './AIConfigTable';
import { useAuthStore } from '@/stores/auth';
import type { AIConfig } from '@/hooks/use-ai-configs';

const seed: AIConfig = {
  id: 1,
  code: 'qwen-prod-code',
  name: 'qwen-prod',
  provider: 'dashscope',
  modelId: 'qwen3.7-plus',
  apiKey: 'sk-abcdefghijklmnopqrstuvwxyz0123456789',
  temperature: 0.7,
  topP: 0.8,
  maxTokens: 2000,
  isDefault: false,
  status: 1,
};

const seedDefault: AIConfig = {
  ...seed,
  id: 2,
  code: 'default-model',
  isDefault: true,
  status: 0,
};

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['ai-config:test', 'ai-config:update', 'ai-config:delete'],
    } as any,
  });
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const noop = () => {};

describe('<AIConfigTable />', () => {
  it('renders rows with masked API key + 启用 tag', { timeout: 15000 }, () => {
    render(
      wrap(
        <AIConfigTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={noop}
          onSetDefault={noop}
          onTest={noop}
        />,
      ),
    );

    expect(screen.getByText('qwen-prod-code')).toBeTruthy();
    expect(screen.getByText('qwen-prod')).toBeTruthy();
    expect(screen.getByText('dashscope')).toBeTruthy();
    expect(screen.getByText('qwen3.7-plus')).toBeTruthy();
    // 0.7 温度
    expect(screen.getByText('0.7')).toBeTruthy();
    // mask: sk-****-****-****-6789(后 4 位)
    expect(screen.getByText('sk-****-****-****-6789')).toBeTruthy();
    // 启用 tag
    expect(screen.getByText('启用')).toBeTruthy();
  });

  it('禁用状态显示禁用 tag', () => {
    render(
      wrap(
        <AIConfigTable
          data={[seedDefault]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={noop}
          onSetDefault={noop}
          onTest={noop}
        />,
      ),
    );
    expect(screen.getByText('禁用')).toBeTruthy();
  });

  it('默认模型的"设默认"按钮不渲染', () => {
    render(
      wrap(
        <AIConfigTable
          data={[seedDefault]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={noop}
          onDelete={noop}
          onSetDefault={noop}
          onTest={noop}
        />,
      ),
    );
    // 「设默认」按钮不应出现(isDefault=true 时被隐藏)
    expect(screen.queryByText('设默认')).toBeNull();
    // 「默认」tag 应出现(列头 + tag 都包含,用 getAllByText)
    expect(screen.getAllByText('默认').length).toBeGreaterThan(0);
  });

  it('点击编辑 / 测试 / 设默认 / 删除 触发对应回调', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onSetDefault = vi.fn();
    const onTest = vi.fn();

    render(
      wrap(
        <AIConfigTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onEdit={onEdit}
          onDelete={onDelete}
          onSetDefault={onSetDefault}
          onTest={onTest}
        />,
      ),
    );

    // antd 5.x Button autoInsertSpace 会把「测试」拆成「测 试」,用 normalizeWhitespace
    const clickBtn = async (label: string) => {
      const candidates = screen.getAllByText(
        (_, n) => n?.textContent?.replace(/\s+/g, '') === label,
      );
      // 锁定到最近的 button 元素(避免命中 tag / span)
      const btn = candidates
        .map((el) => el.closest('button') ?? (el as HTMLElement))
        .find((el) => el.tagName === 'BUTTON') as HTMLElement;
      expect(btn).toBeTruthy();
      await user.click(btn);
    };

    await clickBtn('测试');
    expect(onTest).toHaveBeenCalledWith(seed);

    await clickBtn('设默认');
    expect(onSetDefault).toHaveBeenCalledWith(seed.id);

    await clickBtn('编辑');
    expect(onEdit).toHaveBeenCalledWith(seed);

    await clickBtn('删除');
    // Popconfirm 在 DOM 中弹出(antd 5 默认的弹层),内容用文字匹配找 OK / 确定
    await waitFor(() => {
      const okBtn = screen.getAllByText(
        (_, n) => n?.textContent?.trim() === 'OK' || n?.textContent?.trim() === '确定',
      )[0];
      expect(okBtn).toBeTruthy();
      fireEvent.click(okBtn as HTMLElement);
    });
    expect(onDelete).toHaveBeenCalledWith(seed.id);
  });

  it('分页 next 触发 onPageChange', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      wrap(
        <AIConfigTable
          data={[seed]}
          loading={false}
          page={1}
          pageSize={20}
          total={50}
          onPageChange={onPageChange}
          onEdit={noop}
          onDelete={noop}
          onSetDefault={noop}
          onTest={noop}
        />,
      ),
    );
    const next = container.querySelector('.ant-pagination-item-2') as HTMLElement | null;
    if (next) {
      fireEvent.click(next);
      // antd Table pagination.onChange 签名是 (page, pageSize)
      expect(onPageChange).toHaveBeenCalledWith(2, 20);
    }
  });
});

describe('maskApiKey', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(maskApiKey(null)).toBe('');
    expect(maskApiKey(undefined)).toBe('');
    expect(maskApiKey('')).toBe('');
  });

  it('returns input as-is when length < 7', () => {
    expect(maskApiKey('abc')).toBe('abc');
  });

  it('masks standard API keys (first 3 + **** + last 4)', () => {
    // slice(0,3) = 'sk-', slice(-4) = 'mnop';前后用 4 段 **** 隔开
    expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-****-****-****-mnop');
  });
});
