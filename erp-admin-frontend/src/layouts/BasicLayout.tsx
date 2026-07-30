import { useEffect, useMemo, useState } from 'react';
import { Layout } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMenuTree } from '@/services/menu';
import { useAuthStore } from '@/stores/auth';
import { useMenuStore } from '@/stores/menu';
import { useResponsive } from '@/hooks/use-responsive';
import { AppSider, findFirstPath } from './components/AppSider';
import { AppHeader } from './components/AppHeader';
import { MobileDrawer } from './components/MobileDrawer';

const { Content } = Layout;

export function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const userInfo = useAuthStore((s) => s.userInfo);
  const setMenus = useMenuStore((s) => s.setMenus);

  const { isMobile } = useResponsive();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // queryKey 含 userId → 切换用户自动 refetch
  const { data: tree, isLoading } = useQuery({
    queryKey: ['menus', 'tree', userInfo?.id ?? 'guest'],
    queryFn: fetchMenuTree,
    staleTime: 60_000, // 1 分钟,避免频繁请求
    gcTime: 5 * 60_000,
    enabled: !!userInfo, // 未登录不请求
  });

  useEffect(() => {
    if (tree) setMenus(tree);
  }, [tree, setMenus]);

  const defaultKey = useMemo(() => {
    if (location.pathname !== '/') return location.pathname;
    return findFirstPath(tree || []) || '/';
  }, [tree, location.pathname]);

  useEffect(() => {
    if (location.pathname === '/' && tree && tree.length > 0) {
      const first = findFirstPath(tree);
      if (first) navigate(first, { replace: true });
    }
  }, [tree, location.pathname, navigate]);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <AppSider
          tree={tree}
          isLoading={isLoading}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          selectedKey={defaultKey}
        />
      )}

      <Layout style={{ background: 'var(--bg-app)' }}>
        <AppHeader
          isMobile={isMobile}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <Content>
          <Outlet />
        </Content>
      </Layout>

      <MobileDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        tree={tree}
        isLoading={isLoading}
        selectedKey={defaultKey}
      />
    </Layout>
  );
}
