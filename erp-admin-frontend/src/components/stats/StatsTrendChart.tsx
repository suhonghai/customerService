import { Suspense, lazy } from 'react';
import { Spin } from 'antd';

const Line = lazy(() => import('@ant-design/charts').then((m) => ({ default: m.Line })));

const ChartFallback = (
  <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin />
  </div>
);

export interface StatsTrendChartProps {
  /** 折线图数据 — date/count */
  data: { date: string; count: number }[];
  /** 加载中 —— 父组件控制 Card loading 状态 */
  loading?: boolean;
}

/**
 * Stats Overview 近 7 天会话趋势折线图。
 *
 * @ant-design/charts 用 G2/G2plot 体积较大(~300KB),
 * 用 React.lazy 延迟加载,只在用户进 Stats 页才下载。
 *
 * 数据为空时父组件传空数组即可,本组件照样渲染 Line(展示空 axis)。
 */
export function StatsTrendChart({ data }: StatsTrendChartProps) {
  return (
    <Suspense fallback={ChartFallback}>
      <Line
        data={data}
        xField="date"
        yField="count"
        height={240}
        smooth
        point={{ size: 5, shape: 'circle' }}
        color="#1677ff"
        xAxis={{ title: '' }}
        yAxis={{ title: '' }}
        tooltip={{
          showCrosshairs: true,
          shared: true,
        }}
        annotations={[
          {
            type: 'line',
            start: ['min', 'median'],
            end: ['max', 'median'],
            style: {
              stroke: '#ffa940',
              lineDash: [4, 4],
              lineWidth: 1,
            },
          },
        ]}
      />
    </Suspense>
  );
}
