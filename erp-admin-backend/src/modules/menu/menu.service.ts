import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

export interface MenuNode {
  id: number;
  parentId: number | null;
  name: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  type: number;
  permCode: string | null;
  sort: number;
  visible: boolean;
  children: MenuNode[];
}

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/menus
   * 扁平列表(按 sort asc)
   */
  async list() {
    return this.prisma.menu.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * GET /api/menus/tree
   * 树形(供前端 sidebar)— 已按当前用户角色绑定的菜单过滤
   */
  async treeForUser(userId: number) {
    // 取该用户所有角色绑定的菜单 id(type=1/2,status=1,visible=1)
    const userMenuIds = await this.prisma.roleMenu.findMany({
      where: {
        role: {
          users: { some: { userId } },
          deletedAt: null,
        },
      },
      select: { menuId: true },
    });
    const ids = [...new Set(userMenuIds.map((r) => r.menuId))];

    // 树根需要父链,所以查 status=1 的全集,再 filter 到 userMenu + 父链
    const all = await this.prisma.menu.findMany({
      where: { status: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const allowed = new Set(ids);
    // 把所有祖先(menu.parentId 的链路)也允许,以便 type=1 目录显示
    const parentIds = new Set<number>();
    for (const m of all) {
      if (allowed.has(m.id) && m.parentId != null) {
        let cur: number | null = m.parentId;
        while (cur != null) {
          parentIds.add(cur);
          const p: { parentId: number | null } | null = await this.prisma.menu.findUnique({
            where: { id: cur },
            select: { parentId: true },
          });
          cur = p?.parentId ?? null;
        }
      }
    }
    const finalIds = new Set([...allowed, ...parentIds]);
    return this.buildTree(all.filter((m) => finalIds.has(m.id)));
  }

  /**
   * GET /api/menus/tree (admin)
   * 全菜单树
   */
  async tree() {
    const all = await this.prisma.menu.findMany({
      where: { status: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return this.buildTree(all);
  }

  /**
   * 内部:把扁平菜单数组构造为树形
   */
  private buildTree(all: any[]): MenuNode[] {
    const byId = new Map<number, MenuNode>();
    for (const m of all) {
      byId.set(m.id, {
        id: m.id,
        parentId: m.parentId,
        name: m.name,
        path: m.path,
        component: m.component,
        icon: m.icon,
        type: m.type,
        permCode: m.permCode,
        sort: m.sort,
        visible: m.visible,
        children: [],
      });
    }
    const roots: MenuNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId == null) {
        roots.push(node);
      } else {
        const parent = byId.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }
    return roots;
  }

  /**
   * POST /api/menus
   */
  async create(dto: CreateMenuDto) {
    if (dto.type === 3 && !dto.permCode) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        'type=3(按钮)必须指定 permCode',
      );
    }
    if (dto.type === 2 && (!dto.path || !dto.component)) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        'type=2(菜单)必须指定 path 和 component',
      );
    }
    // parent 存在性
    if (dto.parentId != null) {
      const p = await this.prisma.menu.findUnique({
        where: { id: dto.parentId },
      });
      if (!p) {
        throw new BizException(BizCode.PARAM_ERROR, '父菜单不存在');
      }
    }
    try {
      return await this.prisma.menu.create({
        data: {
          parentId: dto.parentId ?? null,
          name: dto.name,
          path: dto.path ?? null,
          component: dto.component ?? null,
          icon: dto.icon ?? null,
          type: dto.type,
          permCode: dto.permCode ?? null,
          sort: dto.sort ?? 0,
          visible: dto.visible ?? true,
          status: dto.status ?? 1,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.USERNAME_EXISTS, 'permCode 已存在');
      }
      throw e;
    }
  }

  /**
   * PUT /api/menus/:id
   */
  async update(id: number, dto: UpdateMenuDto) {
    const exist = await this.prisma.menu.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.PARAM_ERROR, '菜单不存在');
    }
    if (dto.type === 3 && !dto.permCode && !exist.permCode) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        'type=3(按钮)必须指定 permCode',
      );
    }
    try {
      return await this.prisma.menu.update({
        where: { id },
        data: {
          parentId: dto.parentId ?? undefined,
          name: dto.name ?? undefined,
          path: dto.path ?? undefined,
          component: dto.component ?? undefined,
          icon: dto.icon ?? undefined,
          type: dto.type ?? undefined,
          permCode: dto.permCode ?? undefined,
          sort: dto.sort ?? undefined,
          visible: dto.visible ?? undefined,
          status: dto.status ?? undefined,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.USERNAME_EXISTS, 'permCode 已存在');
      }
      throw e;
    }
  }

  /**
   * DELETE /api/menus/:id
   * 软删除(有子菜单或角色绑定 → 40003)
   */
  async delete(id: number) {
    const exist = await this.prisma.menu.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.PARAM_ERROR, '菜单不存在');
    }
    const child = await this.prisma.menu.findFirst({
      where: { parentId: id },
    });
    if (child) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        '存在子菜单,无法删除',
      );
    }
    const roleBinding = await this.prisma.roleMenu.findFirst({
      where: { menuId: id },
    });
    if (roleBinding) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        '菜单已被角色绑定,无法删除',
      );
    }
    await this.prisma.menu.delete({ where: { id } });
    return { id };
  }
}
