import { Suspense, lazy, useState } from 'react';
import { Card, DatePicker, Progress, Space, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { statsApi, type AiHitRateRow } from '@/services/stats';
import { hitRateStatus, hitRateBarColor } from './stats-utils';

const { RangePicker } = DatePicker;

// @ant-design/charts 用 G2/G2plot,体积较大(~300KB)。
// 在测试环境(jsdom)中图表库会报错,因此顶层 vi.mock 整个模块;
// 这里保留 lazy + Suspense 是为了生产环境按需加载。
const Column = lazy(() => import('@ant-design/charts').then((m) => ({ default: m.Column })));

const ChartFallback = (
  <div
    style={{
      height: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Spin />
  </div>
);

/** 把 AI 命中率行映射成柱图所需数据(单位 %) */
function toChartRows(rows: AiHitRateRow[]) {
  return rows.map((d) => ({
    modelName: d.modelName,
    hitRatePct: Number((d.hitRate * 100).toFixed(2)),
    escalated: d.escalatedSessions,
  }));
}

function defaultRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(30, 'day'), dayjs()];
}

/**
 * Stats "AI 命中率"Tab —— RangePicker + 命中率对比柱图 + 命中率表格。
 *
 * 表格列:
 *   模型 / 编码 / 总会话数 / 转人工 / 命中率(Progress + hitRateStatus 配色)。
 *
 * 自身 useQuery 拉取;空数据时不渲染柱图。
 */
export function StatsAIHitRateTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'ai-hit', range?.[0]?.toISOString(), range?.[1]?.toISOString()],
    queryFn: () =>
      statsApi.aiHitRate({
        startDate: range[0].toISOString(),
        endDate: range[1].toISOString(),
      }),
  });

  const columns: ColumnsType<AiHitRateRow> = [
    { title: '模型', dataIndex: 'modelName', width: 200 },
    { title: '编码', dataIndex: 'modelCode', width: 140 },
    { title: '总会话数', dataIndex: 'totalSessions', width: 110 },
    { title: '转人工', dataIndex: 'escalatedSessions', width: 100 },
    {
      title: '命中率',
      dataIndex: 'hitRate',
      render: (v: number) => (
        <Progress percent={Number((v * 100).toFixed(1))} size="small" status={hitRateStatus(v)} />
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
      </Space>
      {/* 模型命中率柱状图(可视化对比) */}
      {data && data.length > 0 && (
        <Card title="命中率对比" style={{ marginBottom: 16 }}>
          <Suspense fallback={ChartFallback}>
            <Column
              data={toChartRows(data)}
              xField="modelName"
              yField="hitRatePct"
              height={240}
              color={({ hitRatePct }: { hitRatePct: number }) => hitRateBarColor(hitRatePct)}
              label={{ position: 'top', formatter: (v: number) => `${v}%` }}
              xAxis={{ title: '' }}
              yAxis={{ title: '命中率(%)', max: 100 }}
              tooltip={{
                formatter: (datum: { hitRatePct: number; escalated: number }) => ({
                  name: '命中率',
                  value: `${datum.hitRatePct}%`,
                }),
              }}
            />
          </Suspense>
        </Card>
      )}
      <Table
        rowKey="modelCode"
        loading={isLoading}
        dataSource={data || []}
        pagination={false}
        columns={columns}
      />
    </div>
  );
}

export default StatsAIHitRateTab;
