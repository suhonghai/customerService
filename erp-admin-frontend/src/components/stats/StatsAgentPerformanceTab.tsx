import { useState } from 'react';
import { DatePicker, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { statsApi, type AgentPerformanceRow } from '@/services/stats';
import { ratingTagColor } from './stats-utils';

const { RangePicker } = DatePicker;

/** RangePicker 默认 30 天 */
function defaultRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(30, 'day'), dayjs()];
}

/**
 * Stats "客服绩效"Tab —— RangePicker + 客服绩效表格。
 *
 * 表格列:
 *   客服 / 工单数 / 平均处理时长 / 平均评分(按 ratingTagColor 上 Tag)。
 *
 * 自身 useQuery 拉取,父组件无需透传 props。
 */
export function StatsAgentPerformanceTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'agent-perf', range?.[0]?.toISOString(), range?.[1]?.toISOString()],
    queryFn: () =>
      statsApi.agentPerformance({
        startDate: range[0].toISOString(),
        endDate: range[1].toISOString(),
      }),
  });

  const columns: ColumnsType<AgentPerformanceRow> = [
    { title: '客服', dataIndex: 'agentName', width: 140 },
    { title: '工单数', dataIndex: 'ticketCount', width: 100 },
    {
      title: '平均处理时长(分钟)',
      dataIndex: 'avgResolveMinutes',
      width: 160,
    },
    {
      title: '平均评分',
      dataIndex: 'ratingAvg',
      width: 140,
      render: (v: number) => <Tag color={ratingTagColor(v)}>{Number(v).toFixed(2)}</Tag>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
      </Space>
      <Table
        rowKey="agentId"
        loading={isLoading}
        dataSource={data || []}
        pagination={false}
        columns={columns}
      />
    </div>
  );
}

export default StatsAgentPerformanceTab;
