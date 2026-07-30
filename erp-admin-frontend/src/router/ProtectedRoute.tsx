import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/utils/permission';

// 模块级稳定引用,避免每次 selector 返回新 [] 触发死循环
const EMPTY_PERMS: readonly string[] = Object.freeze([]);

interface Props {
  children: ReactNode;
  /** 进入该路由需要的权限码(支持 user:* 通配) */
  requiredPerm?: string;
}

export function ProtectedRoute({ children, requiredPerm }: Props) {
  // 拆成两个独立 atom,Zustand 自动判断引用稳定性
  const accessToken = useAuthStore((s) => s.accessToken);
  const perms = useAuthStore((s) => s.userInfo?.permissions ?? (EMPTY_PERMS as string[]));
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (requiredPerm && !hasPermission(perms, requiredPerm)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
