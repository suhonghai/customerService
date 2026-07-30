import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { AssignMenusDto } from './dto/assign-menus.dto';

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/roles
   * 分页 + 模糊筛选
   */
  async list(query: QueryRoleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RoleWhereInput = {};
    if (query.code) where.code = { contains: query.code };
    if (query.name) where.name = { contains: query.name };
    if (query.status !== undefined) where.status = query.status;

    const orderBy: Prisma.RoleOrderByWithRelationInput = {
      [query.sortBy ?? 'sort']: query.sortOrder ?? 'asc',
    } as Prisma.RoleOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.role.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  /**
   * GET /api/roles/:id
   * 详情(含 menuIds)
   */
  async getById(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        menus: { select: { menuId: true } },
      },
    });
    if (!role) {
      throw new BizException(BizCode.ROLE_NOT_FOUND, '角色不存在');
    }
    const menuIds = role.menus.map((m) => m.menuId);
    return { ...role, menuIds };
  }

  /**
   * POST /api/roles
   * 创建角色(code 唯一)
   */
  async create(dto: CreateRoleDto) {
    // 校验 dataScope=4 时 customDeptIds 必填
    if (dto.dataScope === 4 && !dto.customDeptIds) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        'dataScope=4 自定义时,customDeptIds 必填',
      );
    }
    if (dto.customDeptIds) {
      // 校验格式
      if (!/^\d+(,\d+)*$/.test(dto.customDeptIds)) {
        throw new BizException(
          BizCode.PARAM_ERROR,
          'customDeptIds 格式错误,需为逗号分隔数字',
        );
      }
    }

    try {
      const role = await this.prisma.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          dataScope: dto.dataScope ?? 1,
          customDeptIds: dto.customDeptIds ?? null,
          sort: dto.sort ?? 0,
          status: dto.status ?? 1,
        },
      });
      return role;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.USERNAME_EXISTS, '角色 code 已存在');
      }
      throw e;
    }
  }

  /**
   * PUT /api/roles/:id
   */
  async update(id: number, dto: UpdateRoleDto) {
    const exist = await this.prisma.role.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.ROLE_NOT_FOUND, '角色不存在');
    }
    // dataScope=4 必填 customDeptIds
    const newDataScope = dto.dataScope ?? exist.dataScope;
    if (newDataScope === 4) {
      const newCustom = dto.customDeptIds ?? exist.customDeptIds;
      if (!newCustom) {
        throw new BizException(
          BizCode.PARAM_ERROR,
          'dataScope=4 自定义时,customDeptIds 必填',
        );
      }
      if (!/^\d+(,\d+)*$/.test(newCustom)) {
        throw new BizException(
          BizCode.PARAM_ERROR,
          'customDeptIds 格式错误',
        );
      }
    }
    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          code: dto.code ?? undefined,
          name: dto.name ?? undefined,
          description: dto.description ?? undefined,
          dataScope: dto.dataScope ?? undefined,
          customDeptIds: dto.customDeptIds ?? undefined,
          sort: dto.sort ?? undefined,
          status: dto.status ?? undefined,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.USERNAME_EXISTS, '角色 code 已存在');
      }
      throw e;
    }
  }

  /**
   * DELETE /api/roles/:id
   * 软删除(builtin=true 不可删;有 user 绑定不可删)
   */
  async delete(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { users: { take: 1 } },
    });
    if (!role) {
      throw new BizException(BizCode.ROLE_NOT_FOUND, '角色不存在');
    }
    if (role.builtin) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '内置角色不可删除');
    }
    if (role.users.length > 0) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        '该角色仍被用户绑定,无法删除',
      );
    }
    // 软删:Prisma 中间件自动转 update deletedAt
    await this.prisma.role.delete({ where: { id } });
    return { id };
  }

  /**
   * PUT /api/roles/:id/menus
   * 分配菜单(事务)
   */
  async assignMenus(id: number, dto: AssignMenusDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new BizException(BizCode.ROLE_NOT_FOUND, '角色不存在');
    }
    // 校验 menuIds 存在
    if (dto.menuIds.length > 0) {
      const count = await this.prisma.menu.count({
        where: { id: { in: dto.menuIds } },
      });
      if (count !== dto.menuIds.length) {
        throw new BizException(
          BizCode.PARAM_ERROR,
          'menuIds 包含不存在的菜单',
        );
      }
    }
    // 事务:删旧 + 插新
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      this.prisma.roleMenu.createMany({
        data: dto.menuIds.map((menuId) => ({ roleId: id, menuId })),
      }),
    ]);
    return { roleId: id, menuIds: dto.menuIds };
  }

  /**
   * GET /api/roles/:id/menus
   */
  async getMenus(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new BizException(BizCode.ROLE_NOT_FOUND, '角色不存在');
    }
    const rows = await this.prisma.roleMenu.findMany({
      where: { roleId: id },
      select: { menuId: true },
    });
    return rows.map((r) => r.menuId);
  }
}
