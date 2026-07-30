import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsKpiCards } from './StatsKpiCards';
import type { StatsOverview } from '@/services/stats';

function makeData(over: Partial<StatsOverview> = {}): StatsOverview {
  return {
    sessionToday: 12,
    sessionTrend: [],
    ticketPending: 3,
    ticketProcessing: 5,
    aiHitRate: 0.65,
    avgResponseSeconds: 12.3,
    avgRating: 4.2,
    ...over,
  };
}

describe('<StatsKpiCards />', () => {
  it('renders all 5 titles', () => {
    render(<StatsKpiCards data={makeData()} />);
    expect(screen.getByText('今日会话')).toBeTruthy();
    expect(screen.getByText('待领取工单')).toBeTruthy();
    expect(screen.getByText('处理中工单')).toBeTruthy();
    expect(screen.getByText('AI 命中率')).toBeTruthy();
    expect(screen.getByText('平均评分')).toBeTruthy();
  });

  it('renders numeric KPI values from data', () => {
    render(
      <StatsKpiCards
        data={makeData({ sessionToday: 42, ticketPending: 7, ticketProcessing: 11 })}
      />,
    );
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
  });

  it('formats AI hit rate as percentage string', () => {
    // 0.65 → 65.0%
    render(<StatsKpiCards data={makeData({ aiHitRate: 0.65 })} />);
    expect(screen.getByText('65.0%')).toBeTruthy();
  });

  it('renders avgRating with 2-decimal precision and / 5 suffix', () => {
    render(<StatsKpiCards data={makeData({ avgRating: 4.5 })} />);
    // antd Statistic 用 precision=2 + value=4.5 → int "4" + decimal ".50"
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('.50')).toBeTruthy();
    // "/ 5" 是 suffix
    expect(screen.getAllByText('/ 5').length).toBeGreaterThan(0);
  });

  it('falls back to 0 for KPI counts when data is undefined', () => {
    render(<StatsKpiCards />);
    // sessionToday/ticketPending/ticketProcessing 都是 undefined ?? 0 → 渲染 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it('falls back to "-" for AI hit rate when data is undefined', () => {
    render(<StatsKpiCards />);
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('renders loading skeletons when loading=true', () => {
    const { container } = render(<StatsKpiCards data={makeData()} loading />);
    // antd Card loading 时内部渲染 .ant-skeleton 元素
    const skeletons = container.querySelectorAll('.ant-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
