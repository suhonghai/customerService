import { Card, Col, Row, Space } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  MenuOutlined,
  RocketOutlined,
  MessageOutlined,
  BarChartOutlined,
  AuditOutlined,
  ProfileOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { LINKS, type QuickLink, type QuickLinkIconKey } from './dashboard-constants';
import { enabled } from './dashboard-utils';

const ICON_MAP: Record<QuickLinkIconKey, React.ReactNode> = {
  user: <UserOutlined />,
  role: <TeamOutlined />,
  menu: <MenuOutlined />,
  ai: <RocketOutlined />,
  session: <MessageOutlined />,
  stats: <BarChartOutlined />,
  audit: <AuditOutlined />,
  profile: <ProfileOutlined />,
  dict: <BookOutlined />,
};

export interface QuickAccessGridProps {
  /** 用户权限 code 列表 */
  perms: string[];
  /** 点击有权限的 link 时回调(父容器 navigate) */
  onNavigate: (path: string) => void;
  /** 可选:覆盖默认 LINKS(测试或运营调整) */
  links?: QuickLink[];
}

/**
 * Dashboard 底部 — 9 宫格快速入口。
 *
 * 无权限时:卡片灰色 + 不可点击 + 显示 'no permission' 提示;
 * 有权限时:hoverable + 点击触发 onNavigate(path)。
 */
export function QuickAccessGrid({ perms, onNavigate, links }: QuickAccessGridProps) {
  const items = links ?? LINKS;

  return (
    <>
      <div className="section-tag reveal reveal-2" style={{ marginBottom: 20 }}>
        <span className="num">§ 03</span>
        <span>Quick Access / 快速入口</span>
      </div>
      <Row gutter={[20, 20]} data-testid="quick-access-grid">
        {items.map((l, i) => {
          const ok = enabled(perms, l);
          return (
            <Col key={l.path} xs={24} sm={12} md={8}>
              <Card
                className={`interactive reveal reveal-${(i % 4) + 2}`}
                hoverable={ok}
                styles={{ body: { padding: 24 } }}
                style={{
                  height: '100%',
                  opacity: ok ? 1 : 0.5,
                  cursor: ok ? 'pointer' : 'not-allowed',
                }}
                onClick={() => ok && onNavigate(l.path)}
                data-testid={`quick-link-${l.path}`}
                data-enabled={ok ? '1' : '0'}
              >
                <Space align="start" size={14} style={{ width: '100%' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                      transition: 'color 0.2s',
                    }}
                  >
                    {ICON_MAP[l.icon]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 500,
                        fontSize: 17,
                        letterSpacing: '-0.01em',
                        marginBottom: 4,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {l.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--text-regular)',
                        lineHeight: 1.55,
                      }}
                    >
                      {l.desc}
                    </div>
                    {!ok && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-warning)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        · no permission
                      </div>
                    )}
                  </div>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </>
  );
}
