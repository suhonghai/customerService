import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic } from 'antd';
import { statsApi } from '@/services/stats';
import { StatsKpiCards } from './StatsKpiCards';
import { StatsTrendChart } from './StatsTrendChart';

/**
 * Stats 页"总览"Tab — 上半区 5 KPI + 下半区(趋势折线图 + 响应&评分)。
 *
 * 业务数据由本组件内 useQuery 拉取,所有渲染委托给子组件:
 *   - <StatsKpiCards> 顶部 5 卡
 *   - <StatsTrendChart> 近 7 天会话折线图(@ant-design/charts lazy)
 *
 * 响应时长 + 平均评分留在这里:它属于 Overview 半区右侧的指标卡,
 * 跟 KPI 卡是同一行视觉逻辑(独立 Card,与"近 7 天会话趋势"并列),
 * 但不像 KPI 那样满列宽。放在 page 层避免参数链路过深。
 */
export function StatsOverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => statsApi.overview(),
  });

  const trend: { date: string; count: number }[] = data?.sessionTrend || [];
  const hasTrend = trend.length > 0;

  return (
    <div>
      <StatsKpiCards data={data} loading={isLoading} />

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="近 7 天会话趋势" loading={isLoading}>
            {hasTrend ? (
              <StatsTrendChart data={trend} loading={isLoading} />
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无数据</div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="响应 & 评分" loading={isLoading}>
            <Statistic
              title="平均响应时长(秒)"
              value={data?.avgResponseSeconds ?? 0}
              precision={1}
            />
            <div style={{ marginTop: 12 }}>
              <Statistic title="平均评分" value={data?.avgRating ?? 0} precision={2} suffix="/ 5" />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default StatsOverviewTab;
