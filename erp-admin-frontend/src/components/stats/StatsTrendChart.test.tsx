import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { StatsTrendChart } from './StatsTrendChart';

// @ant-design/charts 在 jsdom 下渲染会抛 + 体积过大,直接 stub 成 div
// (对应 plan 风险 #1:Stats @ant-design/charts 集成 jsdom 渲染报错)
vi.mock('@ant-design/charts', () => ({
  Line: (props: { data: unknown[]; xField: string; yField: string }) => (
    <div data-testid="mock-line-chart" data-len={props.data?.length ?? 0}>
      mock-line
    </div>
  ),
}));

const trend = [
  { date: '2026-07-10', count: 10 },
  { date: '2026-07-11', count: 14 },
  { date: '2026-07-12', count: 7 },
];

describe('<StatsTrendChart />', () => {
  it('renders lazy chart after Suspense resolves', async () => {
    render(
      <Suspense fallback={<div data-testid="fallback">loading</div>}>
        <StatsTrendChart data={trend} />
      </Suspense>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mock-line-chart')).toBeTruthy();
    });
  });

  it('forwards data length to mocked Line component', async () => {
    render(
      <Suspense fallback={null}>
        <StatsTrendChart data={trend} />
      </Suspense>,
    );
    await waitFor(() => {
      const el = screen.getByTestId('mock-line-chart');
      expect(el.getAttribute('data-len')).toBe('3');
    });
  });

  it('renders empty chart when data is empty array', async () => {
    render(
      <Suspense fallback={null}>
        <StatsTrendChart data={[]} />
      </Suspense>,
    );
    await waitFor(() => {
      const el = screen.getByTestId('mock-line-chart');
      expect(el.getAttribute('data-len')).toBe('0');
    });
  });
});
