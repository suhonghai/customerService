import { Dropdown, Button, type MenuProps } from 'antd';
import { SunOutlined, MoonOutlined, DesktopOutlined, CheckOutlined } from '@ant-design/icons';
import { useThemeStore, type ThemeMode } from '@/stores/theme';

const ICONS: Record<ThemeMode, React.ReactNode> = {
  light: <SunOutlined />,
  dark: <MoonOutlined />,
  system: <DesktopOutlined />,
};

const LABELS: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

export function ThemeSwitcher() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const items: MenuProps['items'] = (['light', 'dark', 'system'] as ThemeMode[]).map((m) => ({
    key: m,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
        {ICONS[m]}
        <span>{LABELS[m]}</span>
        {mode === m && (
          <CheckOutlined style={{ marginLeft: 'auto', color: 'var(--color-primary)' }} />
        )}
      </span>
    ),
    onClick: () => setMode(m),
  }));

  return (
    <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
      <Button
        type="text"
        icon={ICONS[mode]}
        aria-label="切换主题"
        style={{ width: 36, height: 36 }}
      />
    </Dropdown>
  );
}
