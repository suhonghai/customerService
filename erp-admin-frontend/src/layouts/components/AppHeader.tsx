import { Layout, Dropdown, Avatar, Button, Tooltip, Typography, type MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { MenuOutlined, BellOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useAuthStore } from '@/stores/auth';
import { useMenuStore } from '@/stores/menu';
import { useQueryClient } from '@tanstack/react-query';
import { Breadcrumbs } from './Breadcrumbs';

const { Header } = Layout;
const { Text } = Typography;

export interface AppHeaderProps {
  isMobile: boolean;
  onOpenMobileDrawer: () => void;
  onToggleSidebar: () => void;
}

export function AppHeader({ isMobile, onOpenMobileDrawer, onToggleSidebar }: AppHeaderProps) {
  const navigate = useNavigate();
  const userInfo = useAuthStore((s) => s.userInfo);
  const logoutStore = useAuthStore((s) => s.logout);
  const setMenus = useMenuStore((s) => s.setMenus);
  const queryClient = useQueryClient();

  const userMenu: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心',
      onClick: () => navigate('/profile'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        // 1. 清菜单 store
        setMenus([]);
        // 2. 清 query cache(避免下一个用户看到旧菜单缓存)
        queryClient.clear();
        // 3. 清 auth store
        logoutStore();
        // 4. 跳登录
        navigate('/login', { replace: true });
      },
    },
  ];

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {isMobile ? (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onOpenMobileDrawer}
            style={{ width: 36, height: 36 }}
          />
        ) : (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onToggleSidebar}
            style={{ width: 36, height: 36 }}
            aria-label="折叠侧边栏"
          />
        )}
        <Breadcrumbs />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {!isMobile && (
          <Text
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '0 8px',
            }}
          >
            // production
          </Text>
        )}
        <Tooltip title="通知" placement="bottom">
          <Button
            type="text"
            icon={<BellOutlined />}
            aria-label="通知"
            style={{ width: 36, height: 36 }}
          />
        </Tooltip>
        <ThemeSwitcher />
        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--border-thin)',
            margin: '0 4px',
          }}
        />
        <Dropdown menu={{ items: userMenu }} placement="bottomRight">
          <Button
            type="text"
            style={{
              height: 36,
              padding: '0 8px 0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Avatar
              size={28}
              style={{
                background: 'var(--bg-inverse)',
                color: 'var(--text-inverse)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {(userInfo?.nickname || userInfo?.username || '?').charAt(0).toUpperCase()}
            </Avatar>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {userInfo?.nickname || userInfo?.username}
            </span>
          </Button>
        </Dropdown>
      </div>
    </Header>
  );
}
