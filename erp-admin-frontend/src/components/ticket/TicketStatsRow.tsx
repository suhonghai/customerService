import { Card, Statistic, Row, Col } from 'antd';

interface Stats {
  total?: number;
  pending?: number;
  processing?: number;
  todayNew?: number;
  slaAboutToBreach?: number;
}

interface Props {
  stats: Stats;
  isNarrow: boolean;
}

/**
 * 顶部统计卡 — 总工单 / 待处理 / 处理中 / 今日新增 / SLA 即将超时
 * 窄屏时 Card size='small',数字颜色:红(待处理)/ 蓝(处理中)/ 绿(今日新增)/ 橙(SLA)
 */
export default function TicketStatsRow({ stats, isNarrow }: Props) {
  const cardSize = isNarrow ? 'small' : 'default';
  return (
    <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={8} md={4}>
        <Card size={cardSize}>
          <Statistic title="总工单" value={stats.total ?? '-'} />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={5}>
        <Card size={cardSize}>
          <Statistic
            title="待处理"
            value={stats.pending ?? '-'}
            valueStyle={{ color: '#cf1322' }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={5}>
        <Card size={cardSize}>
          <Statistic
            title="处理中"
            value={stats.processing ?? '-'}
            valueStyle={{ color: '#1677ff' }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={5}>
        <Card size={cardSize}>
          <Statistic
            title="今日新增"
            value={stats.todayNew ?? '-'}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={8} md={5}>
        <Card size={cardSize}>
          <Statistic
            title="SLA 即将超时"
            value={stats.slaAboutToBreach ?? '-'}
            valueStyle={{ color: '#fa8c16' }}
          />
        </Card>
      </Col>
    </Row>
  );
}
