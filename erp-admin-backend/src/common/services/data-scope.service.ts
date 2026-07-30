import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 数据范围(scope)定义,参考 docs/erp-admin/02-database-design.md 4.7
 *   1 全部 (ALL)
 *   2 本部门 (DEPT)
 *   3 本人 (SELF)
 *   4 自定义 (CUSTOM)
 *
 * 多角色时,取所有角色中 dataScope 的**最小值**(权限最大)
 */
export type DataScope = 1 | 2 | 3 | 4;

export interface DataScopeInfo {
  scope: DataScope;
  deptId?: number;
  customDeptIds?: number[];
}

export interface UserListWhere {
  id?: number | { in: number[] };
  departmentId?: number | { in: number[] };
  deletedAt?: null;
  username?: { contains: string };
  nickname?: { contains: string };
  email?: { contains: string };
  status?: number;
  [k: string]: unknown;
}

@Injectable()
export class DataScopeService {
  private readonly logger = new Logger(DataScopeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取当前用户的有效数据范围(多角色取 dataScope 最小值)
   */
  async getUserDataScope(userId: number): Promise<DataScopeInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
      },
    });
    if (!user) {
      return { scope: 3 }; // 兜底为最严格
    }
    const roles = user.roles.map((ur) => ur.role);
    if (roles.length === 0) {
      return { scope: 3 };
    }
    const minScope = Math.min(...roles.map((r) => r.dataScope)) as DataScope;

    if (minScope === 4) {
      const idSet = new Set<number>();
      for (const r of roles) {
        if (r.dataScope === 4 && r.customDeptIds) {
          for (const part of r.customDeptIds.split(',')) {
            const n = Number(part.trim());
            if (Number.isFinite(n)) idSet.add(n);
          }
        }
      }
      return {
        scope: 4,
        customDeptIds: Array.from(idSet),
      };
    }
    return { scope: minScope, deptId: user.departmentId ?? undefined };
  }

  /**
   * 把 dataScope 拼到 User 查询的 where 上(mutation,直接改)
   *
   * - scope=1 (ALL):    不加
   * - scope=2 (DEPT):   where.departmentId = deptId
   * - scope=3 (SELF):   where.id = currentUserId
   * - scope=4 (CUSTOM): where.departmentId = { in: customDeptIds }
   *
   * 注意:Prisma 中间件会自动加 deletedAt: null,无需重复
   */
  applyUserWhere(
    where: UserListWhere,
    currentUserId: number,
    scope: DataScopeInfo,
  ): void {
    if (scope.scope === 1) {
      // 不加
    } else if (scope.scope === 2) {
      if (scope.deptId != null) {
        where.departmentId = scope.deptId;
      } else {
        // 无部门:兜底为本人
        where.id = currentUserId;
      }
    } else if (scope.scope === 3) {
      where.id = currentUserId;
    } else if (scope.scope === 4) {
      if (scope.customDeptIds && scope.customDeptIds.length > 0) {
        where.departmentId = { in: scope.customDeptIds };
      } else {
        // 自定义但没部门:兜底为本人
        where.id = currentUserId;
      }
    }
  }

  /**
   * 取当前用户角色里最小 dataScope(scope = min 即可)
   */
  static minScope(scopes: number[]): DataScope {
    if (scopes.length === 0) return 3;
    return Math.min(...scopes) as DataScope;
  }

  /**
   * 把 dataScope 拼到 Order 查询的 where 上(Day 6)
   *
   * Order 与 User 的关联字段:userId(订单的创建者)
   * - scope=1 (ALL):    不加
   * - scope=2 (DEPT):   where.user = { departmentId: deptId }(通过 user relation 过滤)
   * - scope=3 (SELF):   where.userId = currentUserId
   * - scope=4 (CUSTOM): where.user = { departmentId: { in: customDeptIds } }
   *
   * 使用:
   *   const where: Prisma.OrderWhereInput = { deletedAt: null };
   *   const scope = await this.dataScope.getUserDataScope(cu.id);
   *   this.dataScope.applyOrderWhere(where, cu.id, scope);
   */
  applyOrderWhere(
    where: Prisma.OrderWhereInput,
    currentUserId: number,
    scope: DataScopeInfo,
  ): void {
    if (scope.scope === 1) {
      // ALL — 不加
      return;
    }
    if (scope.scope === 2) {
      if (scope.deptId != null) {
        where.user = { departmentId: scope.deptId };
      } else {
        // 无部门:兜底为本人
        where.userId = currentUserId;
      }
      return;
    }
    if (scope.scope === 3) {
      where.userId = currentUserId;
      return;
    }
    if (scope.scope === 4) {
      if (scope.customDeptIds && scope.customDeptIds.length > 0) {
        where.user = { departmentId: { in: scope.customDeptIds } };
      } else {
        where.userId = currentUserId;
      }
    }
  }

  /**
   * 把 dataScope 拼到 CsTicket 查询的 where 上(Day 7)
   *
   * Ticket 与 User 的关联字段:assigneeId(工单负责人 / 客服坐席)
   * - scope=1 (ALL):    不加
   * - scope=2 (DEPT):   where.assignee = { departmentId: deptId }(assignee 所在部门)
   * - scope=3 (SELF):   where.assigneeId = currentUserId
   * - scope=4 (CUSTOM): where.assignee = { departmentId: { in: customDeptIds } }(Day 9 用)
   *
   * 业务背景:工单按坐席部门划分(客服 1 部门 / 客服 2 部门)
   *
   * 使用:
   *   const where: Prisma.CsTicketWhereInput = { deletedAt: null };
   *   const scope = await this.dataScope.getUserDataScope(cu.id);
   *   this.dataScope.applyTicketWhere(where, cu.id, scope);
   */
  applyTicketWhere(
    where: Prisma.CsTicketWhereInput,
    currentUserId: number,
    scope: DataScopeInfo,
  ): void {
    if (scope.scope === 1) {
      // ALL — 不加
      return;
    }
    if (scope.scope === 2) {
      if (scope.deptId != null) {
        where.assignee = { departmentId: scope.deptId };
      } else {
        // 无部门:兜底为本人
        where.assigneeId = currentUserId;
      }
      return;
    }
    if (scope.scope === 3) {
      where.assigneeId = currentUserId;
      return;
    }
    if (scope.scope === 4) {
      if (scope.customDeptIds && scope.customDeptIds.length > 0) {
        where.assignee = { departmentId: { in: scope.customDeptIds } };
      } else {
        where.assigneeId = currentUserId;
      }
    }
  }

  /**
   * 把 dataScope 拼到 CsSession 查询的 where 上(Day 8)
   *
   * Session 与 User 的关联字段:userId(分配到的客服坐席)
   * - scope=1 (ALL):    不加
   * - scope=2 (DEPT):   where.user = { departmentId: deptId }
   * - scope=3 (SELF):   where.userId = currentUserId
   * - scope=4 (CUSTOM): where.user = { departmentId: { in: customDeptIds } }
   *
   * 业务背景:会话按"承接客服"划分权限,未分配(userId=null)的会话仅 super_admin 可见
   *
   * 使用:
   *   const where: Prisma.CsSessionWhereInput = { deletedAt: null }; // 软删中间件已自动加
   *   const scope = await this.dataScope.getUserDataScope(cu.id);
   *   this.dataScope.applySessionWhere(where, cu.id, scope);
   */
  applySessionWhere(
    where: Prisma.CsSessionWhereInput,
    currentUserId: number,
    scope: DataScopeInfo,
  ): void {
    if (scope.scope === 1) {
      // ALL — 不加
      return;
    }
    if (scope.scope === 2) {
      if (scope.deptId != null) {
        where.user = { departmentId: scope.deptId };
      } else {
        // 无部门:兜底为本人
        where.userId = currentUserId;
      }
      return;
    }
    if (scope.scope === 3) {
      where.userId = currentUserId;
      return;
    }
    if (scope.scope === 4) {
      if (scope.customDeptIds && scope.customDeptIds.length > 0) {
        where.user = { departmentId: { in: scope.customDeptIds } };
      } else {
        where.userId = currentUserId;
      }
    }
  }
}
