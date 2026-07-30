import { Card, Col, Row, Statistic } from 'antd';
import type { StatsOverview } from '@/services/stats';
import { pct } from './stats-utils';

export interface StatsKpiCardsProps {
  /** 总览数据;undefined 表示 loading(由父组件控制 Statistic 内部状态) */
  data?: StatsOverview;
  /** 是否加载中 —— 直接传给 antd Card,做 skeleton 效果 */
  loading?: boolean;
}

/**
 * Stats Overview 顶部 5 卡 KPI:
 *   今日会话 / 待领取工单 / 处理中工单 / AI 命中率 / 平均评分。
 *
 * 父组件负责传 data,本组件只渲染。loading 时通过 antd Card 的 loading 自动 skeleton。
 */
export function StatsKpiCards({ data, loading }: StatsKpiCardsProps) {
  return (
    <Row gutter={16}>
      <Col span={4}>
        <Card loading={loading}>
          <Statistic title="今日会话" value={data?.sessionToday ?? 0} />
        </Card>
      </Col>
      <Col span={4}>
        <Card loading={loading}>
          <Statistic title="待领取工单" value={data?.ticketPending ?? 0} />
        </Card>
      </Col>
      <Col span={4}>
        <Card loading={loading}>
          <Statistic title="处理中工单" value={data?.ticketProcessing ?? 0} />
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={loading}>
          <Statistic title="AI 命中率" value={data ? pct(data.aiHitRate) : '-'} />
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={loading}>
          <Statistic title="平均评分" value={data?.avgRating ?? 0} precision={2} suffix="/ 5" />
        </Card>
      </Col>
    </Row>
  );
}
