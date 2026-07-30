import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatsAgentPerformanceTab } from './StatsAgentPerformanceTab';
import type { AgentPerformanceRow } from '@/services/stats';

// Mock statsApi 全部方法,测试按需返回
const mockAgentPerformance = vi.fn();
vi.mock('@/services/stats', async () => {
  const actual = await vi.importActual<typeof import('@/services/stats')>('@/services/stats');
  return {
    ...actual,
    statsApi: {
      ...actual.statsApi,
      agentPerformance: (...args: any[]) => mockAgentPerformance(...args),
    },
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseRow: AgentPerformanceRow = {
  agentId: 1,
  agentName: '张三',
  ticketCount: 25,
  avgResolveMinutes: 12.5,
  ratingAvg: 4.6,
};

const lowRatingRow: AgentPerformanceRow = {
  agentId: 2,
  agentName: '李四',
  ticketCount: 8,
  avgResolveMinutes: 30.2,
  ratingAvg: 2.4,
};

const midRatingRow: AgentPerformanceRow = {
  agentId: 3,
  agentName: '王五',
  ticketCount: 15,
  avgResolveMinutes: 18.0,
  ratingAvg: 3.5,
};

beforeEach(() => {
  mockAgentPerformance.mockReset();
  mockAgentPerformance.mockResolvedValue([baseRow]);
});

// antd Table 在 jsdom 下首渲偶发超过 5s,本组 15s 兜底
describe('<StatsAgentPerformanceTab />', () => {
  it(
    'calls agentPerformance API on mount with default 30-day range',
    { timeout: 15000 },
    async () => {
      render(wrap(<StatsAgentPerformanceTab />));

      await waitFor(() => {
        expect(mockAgentPerformance).toHaveBeenCalledTimes(1);
      });
      // 默认 range 是 [30 天前, 今天],验证传入了 ISO 字符串
      const callArgs = mockAgentPerformance.mock.calls[0][0];
      expect(callArgs.startDate).toBeTruthy();
      expect(callArgs.endDate).toBeTruthy();
      // startDate 应当早于 endDate
      expect(new Date(callArgs.startDate).getTime()).toBeLessThan(
        new Date(callArgs.endDate).getTime(),
      );
    },
  );

  it('renders rows with 客服/工单数/平均处理时长 columns', { timeout: 15000 }, async () => {
    mockAgentPerformance.mockResolvedValue([baseRow, lowRatingRow]);

    render(wrap(<StatsAgentPerformanceTab />));

    // 等 useQuery resolve → antd Table 行渲染
    await waitFor(() => {
      expect(screen.getByText('张三')).toBeInTheDocument();
    });
    expect(screen.getByText('李四')).toBeInTheDocument();
    // 工单数列
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    // 平均评分(保留 2 位小数)
    expect(screen.getByText('4.60')).toBeInTheDocument();
    expect(screen.getByText('2.40')).toBeInTheDocument();
  });

  it('applies green tag color when ratingAvg >= 4', { timeout: 15000 }, async () => {
    mockAgentPerformance.mockResolvedValue([baseRow]);

    const { container } = render(wrap(<StatsAgentPerformanceTab />));

    await waitFor(() => {
      expect(screen.getByText('4.60')).toBeInTheDocument();
    });
    // 4.60 落在 green Tag 内;antd Tag 在 .ant-tag 内带 className 含 tag 颜色
    const tag = container.querySelector('.ant-tag-green');
    expect(tag).toBeTruthy();
  });

  it('applies gold tag color when ratingAvg in [3, 4)', { timeout: 15000 }, async () => {
    mockAgentPerformance.mockResolvedValue([midRatingRow]);

    const { container } = render(wrap(<StatsAgentPerformanceTab />));

    await waitFor(() => {
      expect(screen.getByText('3.50')).toBeInTheDocument();
    });
    const tag = container.querySelector('.ant-tag-gold');
    expect(tag).toBeTruthy();
  });

  it('applies red tag color when ratingAvg < 3', { timeout: 15000 }, async () => {
    mockAgentPerformance.mockResolvedValue([lowRatingRow]);

    const { container } = render(wrap(<StatsAgentPerformanceTab />));

    await waitFor(() => {
      expect(screen.getByText('2.40')).toBeInTheDocument();
    });
    const tag = container.querySelector('.ant-tag-red');
    expect(tag).toBeTruthy();
  });

  it('renders RangePicker in header', { timeout: 15000 }, async () => {
    render(wrap(<StatsAgentPerformanceTab />));

    // antd RangePicker 渲染成 1 个 .ant-picker.ant-picker-range 根节点
    // + 内部 2 个 .ant-picker-input 包装 + 2 个 input(Start date / End date)
    await waitFor(() => {
      const pickerRoot = document.body.querySelector('.ant-picker-range');
      expect(pickerRoot).toBeTruthy();
      const inputs = document.body.querySelectorAll('.ant-picker-range input');
      expect(inputs.length).toBe(2);
    });
  });

  it('renders empty data state when API returns []', { timeout: 15000 }, async () => {
    mockAgentPerformance.mockResolvedValue([]);

    render(wrap(<StatsAgentPerformanceTab />));

    // 等 query resolve;空数据时无行渲染,但组件不应崩
    await waitFor(() => {
      expect(mockAgentPerformance).toHaveBeenCalled();
    });
    // 验证张三/李四都没出现
    expect(screen.queryByText('张三')).toBeNull();
  });
});
