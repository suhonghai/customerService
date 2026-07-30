import { Tabs } from 'antd';
import StatsOverviewTab from '@/components/stats/StatsOverviewTab';
import StatsAgentPerformanceTab from '@/components/stats/StatsAgentPerformanceTab';
import StatsAIHitRateTab from '@/components/stats/StatsAIHitRateTab';

export default function StatsPage() {
  return (
    <Tabs
      defaultActiveKey="overview"
      items={[
        { key: 'overview', label: '总览', children: <StatsOverviewTab /> },
        { key: 'agent', label: '客服绩效', children: <StatsAgentPerformanceTab /> },
        { key: 'ai', label: 'AI 命中率', children: <StatsAIHitRateTab /> },
      ]}
    />
  );
}
