import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/utils/permission';

// 模块级稳定引用,避免每次 selector 返回新 [] 触发死循环
const EMPTY_PERMS: readonly string[] = Object.freeze([]);

interface Props {
  /** 需要的权限码,如 user:create。为空则不校验 */
  permCode?: string;
  /** 任意命中其一 */
  anyOf?: string[];
  children: ReactNode;
}

/**
 * 按钮级权限:不满足权限码时整棵 children 渲染为 null。
 *
 * 用法:
 *   <PermissionButton permCode="user:create"><Button>新建</Button></PermissionButton>
 */
export function PermissionButton({ permCode, anyOf, children }: Props) {
  // 拆成独立 atom,Zustand 自动判断引用稳定性(EMPTY_PERMS 是模块级稳定引用)
  const perms = useAuthStore((s) => s.userInfo?.permissions ?? (EMPTY_PERMS as string[]));
  if (!permCode && !anyOf) return <>{children}</>;
  if (permCode && hasPermission(perms, permCode)) return <>{children}</>;
  if (anyOf && anyOf.some((p) => hasPermission(perms, p))) return <>{children}</>;
  return null;
}
