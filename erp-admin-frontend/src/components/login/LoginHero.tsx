import { Typography } from 'antd';

const { Text } = Typography;

export interface LoginHeroProps {
  /**
   * 格式化后的日期字符串(如 "Jul 16, 2026")。
   * 由调用方传入,以便测试用 mock Date 锁定。
   */
  dateStr: string;
}

/**
 * 登录页左侧 editorial hero —— brand mark / heading / 副文案 / footer。
 *
 * 纯展示组件,无业务逻辑、无状态。
 */
export function LoginHero({ dateStr }: LoginHeroProps) {
  return (
    <div
      className="auth-hero"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: 'var(--bg-canvas)',
        borderRight: '1px solid var(--border-thin)',
      }}
    >
      {/* Brand */}
      <div>
        <div className="brand-mark" style={{ fontSize: 24, marginBottom: 12 }}>
          W11<span className="amp">&amp;</span>
          <span>ERP</span>
          <span className="sub">v0.1</span>
        </div>
        <Text
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {/* corporate operations · {dateStr} */}
          {`// corporate operations · ${dateStr}`}
        </Text>
      </div>

      {/* Hero statement */}
      <div style={{ maxWidth: 560 }}>
        <div className="section-tag" style={{ marginBottom: 20 }}>
          <span className="num">§ 00</span>
          <span>Sign in / 登录</span>
        </div>
        <h1
          style={{
            fontSize: 64,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            margin: 0,
            marginBottom: 24,
            color: 'var(--text-primary)',
          }}
        >
          A quieter way
          <br />
          to{' '}
          <em
            style={{
              fontStyle: 'italic',
              color: 'var(--color-accent)',
              fontWeight: 400,
            }}
          >
            run the floor.
          </em>
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: 'var(--text-regular)',
            margin: 0,
            maxWidth: 480,
          }}
        >
          一套克制的内部运营系统 —— 服务于客户运营、订单流转、AI 调度与团队协作的
          企业级控制台。登录后进入你的工作台。
        </p>
      </div>

      {/* Footer note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          paddingTop: 32,
          borderTop: '1px solid var(--border-thin)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          v0.1.0 · production
        </div>
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--color-success)',
            boxShadow: '0 0 0 3px var(--color-success-bg, rgba(5,150,105,0.15))',
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          All systems operational
        </div>
      </div>
    </div>
  );
}
