import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatsOverviewTab } from './StatsOverviewTab';

// @ant-design/charts stub,避免 jsdom 渲染报错(plan 风险 #1)
vi.mock('@ant-design/charts', () => ({
  Line: (_props: unknown) => <div data-testid="mock-line-chart">mock-line</div>,
}));

const overviewResponse = {
  sessionToday: 100,
  sessionTrend: [
    { date: '2026-07-10', count: 10 },
    { date: '2026-07-11', count: 14 },
  ],
  ticketPending: 5,
  ticketProcessing: 8,
  aiHitRate: 0.78,
  avgResponseSeconds: 15.4,
  avgRating: 4.3,
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

// 默认 stub statsApi.overview
vi.mock('@/services/stats', () => ({
  statsApi: {
    overview: vi.fn(),
  },
}));

// 用 require 等异步模块解析完再覆盖 mock 实现
import { statsApi } from '@/services/stats';
const overviewMock = statsApi.overview as unknown as ReturnType<typeof vi.fn>;

describe('<StatsOverviewTab />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewMock.mockResolvedValue(overviewResponse);
  });

  it('renders 5 KPI titles from child', async () => {
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      expect(screen.getByText('今日会话')).toBeTruthy();
      expect(screen.getByText('待领取工单')).toBeTruthy();
      expect(screen.getByText('处理中工单')).toBeTruthy();
      expect(screen.getByText('AI 命中率')).toBeTruthy();
      // "平均评分" 在 KPI 卡 + 响应&评分卡 各 1 次,共 2 次(用 getAllByText)
      expect(screen.getAllByText('平均评分').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders 响应 & 评分 card titles in bottom row', async () => {
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      // 响应 & 评分 是独立的 Card 标题(在 h3.ant-card-head-title 里)
      expect(screen.getByText('响应 & 评分')).toBeTruthy();
      // 近 7 天会话趋势 也是 Card 标题
      expect(screen.getByText('近 7 天会话趋势')).toBeTruthy();
    });
  });

  it('renders KPI numbers from API response', async () => {
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      // 100 (sessionToday), 5 (ticketPending), 8 (ticketProcessing)
      expect(screen.getByText('100')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('8')).toBeTruthy();
      // AI 命中率 0.78 → 78.0%
      expect(screen.getByText('78.0%')).toBeTruthy();
    });
  });

  it('renders mocked Line chart when trend data is non-empty', async () => {
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mock-line-chart')).toBeTruthy();
    });
  });

  it('shows 暂无数据 empty state when trend is empty', async () => {
    overviewMock.mockResolvedValue({ ...overviewResponse, sessionTrend: [] });
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeTruthy();
    });
  });

  it('shows secondary avg rating / response time in 响应 & 评分 card', async () => {
    render(wrap(<StatsOverviewTab />));
    await waitFor(() => {
      // 平均响应时长(秒) title + 平均评分 title
      expect(screen.getAllByText('平均响应时长(秒)').length).toBeGreaterThan(0);
      // 平均评分 在 KPI 卡 和 响应评分卡 各 1 次,共 2 次
      expect(screen.getAllByText('平均评分').length).toBeGreaterThanOrEqual(2);
    });
  });
});
