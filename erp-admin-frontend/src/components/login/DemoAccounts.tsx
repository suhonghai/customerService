import { DEMO_ACCOUNTS, type DemoAccount } from './login-constants';

export interface DemoAccountsProps {
  /** 点击 chip 触发,回调 username + password */
  onFill: (username: string, password: string) => void;
  /** 可选:覆盖默认 demo 账号列表(测试用) */
  accounts?: DemoAccount[];
}

/**
 * Demo 账号 chips —— 点击自动填充表单。
 *
 * 纯展示 + 回调。父级拿到 username/password 后自行调用 form.setFieldsValue。
 */
export function DemoAccounts({ onFill, accounts = DEMO_ACCOUNTS }: DemoAccountsProps) {
  return (
    <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid var(--border-thin)' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {/* demo · click to autofill */}
        {'// demo · click to autofill'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {accounts.map((a) => (
          <button
            key={a.username}
            type="button"
            data-testid={`demo-chip-${a.username}`}
            onClick={() => onFill(a.username, a.password)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-regular)',
              fontFamily: 'var(--font-body)',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.color = 'var(--text-regular)';
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
