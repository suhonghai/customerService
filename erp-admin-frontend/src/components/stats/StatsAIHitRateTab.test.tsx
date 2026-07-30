import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatsAIHitRateTab } from './StatsAIHitRateTab';
import type { AiHitRateRow } from '@/services/stats';

// jsdom 下 @ant-design/charts(G2/G2plot)会抛 Not-implemented / canvas 错误,
// 测试里 stub 整个模块为轻量占位组件;生产环境 lazy load 走原版图表。
vi.mock('@ant-design/charts', () => ({
  Column: (props: any) => (
    <div data-testid="mock-column-chart" data-rows={props.data?.length ?? 0} />
  ),
}));

// Mock statsApi.aiHitRate
const mockAiHitRate = vi.fn();
vi.mock('@/services/stats', async () => {
  const actual = await vi.importActual<typeof import('@/services/stats')>('@/services/stats');
  return {
    ...actual,
    statsApi: {
      ...actual.statsApi,
      aiHitRate: (...args: any[]) => mockAiHitRate(...args),
    },
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const goodRow: AiHitRateRow = {
  modelCode: 'gpt-4',
  modelName: 'GPT-4',
  totalSessions: 1000,
  escalatedSessions: 50,
  hitRate: 0.85,
};

const midRow: AiHitRateRow = {
  modelCode: 'claude-3',
  modelName: 'Claude 3',
  totalSessions: 800,
  escalatedSessions: 400,
  hitRate: 0.5,
};

const badRow: AiHitRateRow = {
  modelCode: 'llama-2',
  modelName: 'Llama 2',
  totalSessions: 600,
  escalatedSessions: 480,
  hitRate: 0.2,
};

beforeEach(() => {
  mockAiHitRate.mockReset();
  mockAiHitRate.mockResolvedValue([goodRow]);
});

// antd Table 在 jsdom 下首渲偶发超过 5s,本组 15s 兜底
describe('<StatsAIHitRateTab />', () => {
  it('calls aiHitRate API on mount with default 30-day range', { timeout: 15000 }, async () => {
    render(wrap(<StatsAIHitRateTab />));

    await waitFor(() => {
      expect(mockAiHitRate).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockAiHitRate.mock.calls[0][0];
    expect(callArgs.startDate).toBeTruthy();
    expect(callArgs.endDate).toBeTruthy();
  });

  it('renders rows with 模型/编码/总会话数/转人工 columns', { timeout: 15000 }, async () => {
    mockAiHitRate.mockResolvedValue([goodRow, midRow, badRow]);

    render(wrap(<StatsAIHitRateTab />));

    await waitFor(() => {
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
    });
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('Llama 2')).toBeInTheDocument();
    // 编码
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    // 总会话数
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    // 转人工
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('renders Column chart (mocked) when data is non-empty', { timeout: 15000 }, async () => {
    mockAiHitRate.mockResolvedValue([goodRow, midRow]);

    render(wrap(<StatsAIHitRateTab />));

    await waitFor(() => {
      const chart = screen.getByTestId('mock-column-chart');
      expect(chart).toBeInTheDocument();
      // mock 把行数挂在 data-rows 属性上
      expect(chart.getAttribute('data-rows')).toBe('2');
    });
  });

  it('does not render Column chart when data is empty', { timeout: 15000 }, async () => {
    mockAiHitRate.mockResolvedValue([]);

    render(wrap(<StatsAIHitRateTab />));

    await waitFor(() => {
      expect(mockAiHitRate).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('mock-column-chart')).toBeNull();
  });

  it(
    'Progress bar shows 100% (capped) when hitRate = 1.0 (>= 0.7 → success)',
    { timeout: 15000 },
    async () => {
      mockAiHitRate.mockResolvedValue([{ ...goodRow, hitRate: 1.0, escalatedSessions: 0 }]);

      const { container } = render(wrap(<StatsAIHitRateTab />));

      await waitFor(() => {
        // antd Progress 在 status=success 时挂 .ant-progress-status-success class
        const progress = container.querySelector('.ant-progress-status-success');
        expect(progress).toBeTruthy();
      });
    },
  );

  it(
    'Progress bar shows normal status when hitRate in [0.4, 0.7)',
    { timeout: 15000 },
    async () => {
      mockAiHitRate.mockResolvedValue([midRow]);

      const { container } = render(wrap(<StatsAIHitRateTab />));

      await waitFor(() => {
        expect(screen.getByText('Claude 3')).toBeInTheDocument();
      });
      // hitRate = 0.5 → normal → antd Progress 挂 .ant-progress-status-normal
      const normal = container.querySelector('.ant-progress-status-normal');
      expect(normal).toBeTruthy();
    },
  );

  it('Progress bar shows exception status when hitRate < 0.4', { timeout: 15000 }, async () => {
    mockAiHitRate.mockResolvedValue([badRow]);

    const { container } = render(wrap(<StatsAIHitRateTab />));

    await waitFor(() => {
      expect(screen.getByText('Llama 2')).toBeInTheDocument();
    });
    const exceptionBar = container.querySelector('.ant-progress-status-exception');
    expect(exceptionBar).toBeTruthy();
  });

  it('renders RangePicker in header', { timeout: 15000 }, async () => {
    render(wrap(<StatsAIHitRateTab />));

    // antd RangePicker:1 个 .ant-picker-range 根节点 + 2 个 input
    await waitFor(() => {
      const pickerRoot = document.body.querySelector('.ant-picker-range');
      expect(pickerRoot).toBeTruthy();
      const inputs = document.body.querySelectorAll('.ant-picker-range input');
      expect(inputs.length).toBe(2);
    });
  });
});
