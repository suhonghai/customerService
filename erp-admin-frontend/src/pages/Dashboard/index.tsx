import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listUsers } from '@/services/user';
import { listRoles } from '@/services/role';
import { listMenus } from '@/services/menu';
import { useAuthStore } from '@/stores/auth';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { SystemStats } from '@/components/dashboard/SystemStats';
import { QuickAccessGrid } from '@/components/dashboard/QuickAccessGrid';

/**
 * Dashboard 页面 — 3 段式:Hero(问候) / Stats(4 卡) / QuickAccess(9 宫格)。
 *
 * 数据通过 useQuery 获取,业务逻辑(权限判定 / 时段问候 / 格式化)下沉到子组件,
 * page 层只负责:数据获取 + 子组件组合 + 路由跳转。
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const userInfo = useAuthStore((s) => s.userInfo);
  const perms = userInfo?.permissions || [];

  const usersQ = useQuery({
    queryKey: ['users', 'count'],
    queryFn: () => listUsers({ page: 1, pageSize: 1 }),
    retry: false,
  });
  const rolesQ = useQuery({
    queryKey: ['roles', 'count'],
    queryFn: () => listRoles({ page: 1, pageSize: 1 }),
    retry: false,
  });
  const menusQ = useQuery({
    queryKey: ['menus', 'all'],
    queryFn: () => listMenus({ page: 1, pageSize: 1000 }),
    retry: false,
  });

  return (
    <div>
      <DashboardHero userInfo={userInfo} perms={perms} />
      <SystemStats
        usersCount={usersQ.data?.total}
        usersLoading={usersQ.isLoading}
        rolesCount={rolesQ.data?.total}
        rolesLoading={rolesQ.isLoading}
        menusCount={menusQ.data?.length}
        menusLoading={menusQ.isLoading}
        permissionsCount={perms.length}
      />
      <QuickAccessGrid perms={perms} onNavigate={(p) => navigate(p)} />
    </div>
  );
}
