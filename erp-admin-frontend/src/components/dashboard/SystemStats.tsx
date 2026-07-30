import { Card, Col, Row, Statistic } from 'antd';

export interface SystemStatsProps {
  /** User 总数;undefined → 兜底 '—' + loading */
  usersCount?: number;
  usersLoading?: boolean;
  /** Role 总数;undefined → 兜底 '—' + loading */
  rolesCount?: number;
  rolesLoading?: boolean;
  /** Menu 总数;undefined → 兜底 '—' + loading */
  menusCount?: number;
  menusLoading?: boolean;
  /** Permissions 总数(直接来自 auth store,无需 loading) */
  permissionsCount: number;
}

/**
 * Dashboard 中段 — 系统核心指标 4 卡(User / Role / Menu / Perm)。
 *
 * 纯展示;loading 用 antd Statistic 的 `loading` 属性。
 */
export function SystemStats({
  usersCount,
  usersLoading,
  rolesCount,
  rolesLoading,
  menusCount,
  menusLoading,
  permissionsCount,
}: SystemStatsProps) {
  return (
    <>
      <div className="section-tag reveal reveal-1" style={{ marginBottom: 20 }}>
        <span className="num">§ 02</span>
        <span>System / 核心指标</span>
      </div>
      <Row gutter={[20, 20]} style={{ marginBottom: 48 }}>
        <Col xs={12} sm={8} md={6}>
          <Card className="reveal reveal-1" styles={{ body: { padding: '24px 28px' } }}>
            <Statistic title="Users · 用户" value={usersCount ?? '—'} loading={usersLoading} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card className="reveal reveal-2" styles={{ body: { padding: '24px 28px' } }}>
            <Statistic title="Roles · 角色" value={rolesCount ?? '—'} loading={rolesLoading} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card className="reveal reveal-3" styles={{ body: { padding: '24px 28px' } }}>
            <Statistic title="Menus · 菜单" value={menusCount ?? '—'} loading={menusLoading} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card className="reveal reveal-4" styles={{ body: { padding: '24px 28px' } }}>
            <Statistic title="Permissions · 权限" value={permissionsCount} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
