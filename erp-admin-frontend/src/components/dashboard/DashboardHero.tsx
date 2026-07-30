import { Card, Typography } from 'antd';
import type { UserInfo } from '@/stores/auth';
import { greetByHour, formatDateEn } from './dashboard-utils';

const { Text } = Typography;

export interface DashboardHeroProps {
  /** 登录用户信息(可空:首屏未加载时) */
  userInfo: UserInfo | null;
  /** 用户权限 code 列表(空数组兜底) */
  perms: string[];
  /** 当前时间(可注入便于测试;默认 = new Date()) */
  now?: Date;
}

/**
 * Dashboard 顶部 Hero — 问候语 + 日期 + 角色 / 权限文案。
 *
 * 纯展示组件,无业务状态。`now` 注入便于测试覆盖 4 个时段。
 */
export function DashboardHero({ userInfo, perms, now }: DashboardHeroProps) {
  const at = now ?? new Date();
  const dateStr = formatDateEn(at);
  const greet = greetByHour(at.getHours());
  const name = userInfo?.nickname || userInfo?.username;
  const roles = (userInfo?.roles || []).map((r) => r.name).join(' / ') || '—';

  return (
    <Card
      className="reveal"
      styles={{ body: { padding: '48px 56px' } }}
      style={{ marginBottom: 48 }}
      data-testid="dashboard-hero"
    >
      <div className="section-tag" style={{ marginBottom: 16 }}>
        <span className="num">§ 01</span>
        <span>Dashboard / {dateStr}</span>
      </div>
      <h1
        style={{
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: '-0.025em',
          margin: 0,
          marginBottom: 12,
          color: 'var(--text-primary)',
        }}
      >
        {greet},{' '}
        <em
          style={{
            fontStyle: 'italic',
            color: 'var(--color-accent)',
            fontWeight: 400,
          }}
        >
          {name}
        </em>
      </h1>
      <Text
        style={{
          fontSize: 15,
          color: 'var(--text-regular)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.7,
          maxWidth: 640,
        }}
      >
        欢迎来到 W11 ERP 管理后台。当前角色{' '}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--text-primary)',
          }}
        >
          {roles}
        </span>
        ,已配置{' '}
        <span className="mono" style={{ color: 'var(--color-primary)' }}>
          {perms.length}
        </span>{' '}
        个权限点。 下面是当前系统的核心指标。
      </Text>
    </Card>
  );
}
