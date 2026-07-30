import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { DataScopeService, UserListWhere } from '../../common/services/data-scope.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { BCRYPT_COST } from '../auth/constants';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScope: DataScopeService,
  ) {}

  /**
   * GET /api/users
   * 分页 + DataScope 自动过滤
   */
  async list(query: QueryUserDto, currentUserId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: UserListWhere = {};

    // 1) 业务筛选
    if (query.username) where.username = { contains: query.username };
    if (query.nickname) where.nickname = { contains: query.nickname };
    if (query.status !== undefined) where.status = query.status;
    if (query.departmentId !== undefined) where.departmentId = query.departmentId;

    // 2) DataScope 过滤
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applyUserWhere(where, currentUserId, scope);

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy ?? 'id']: query.sortOrder ?? 'desc',
    } as Prisma.UserOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          roles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // 脱敏:list 不返 passwordHash
    const safeList = list.map((u) => this.toSafeUser(u));
    return { list: safeList, total, page, pageSize };
  }

  /**
   * GET /api/users/:id
   */
  async getById(id: number) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
      },
    });
    if (!u) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    return this.toSafeUser(u);
  }

  /**
   * POST /api/users
   */
  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    // 校验 roleIds
    if (dto.roleIds && dto.roleIds.length > 0) {
      const cnt = await this.prisma.role.count({
        where: { id: { in: dto.roleIds } },
      });
      if (cnt !== dto.roleIds.length) {
        throw new BizException(BizCode.PARAM_ERROR, 'roleIds 包含不存在的角色');
      }
    }
    try {
      const u = await this.prisma.user.create({
        data: {
          username: dto.username,
          passwordHash,
          nickname: dto.nickname ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          departmentId: dto.departmentId ?? null,
          status: 1,
          remark: dto.remark ?? null,
          roles: dto.roleIds && dto.roleIds.length > 0
            ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
            : undefined,
        },
        include: { roles: { include: { role: true } } },
      });
      return this.toSafeUser(u);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = (e.meta?.target as string[]) ?? [];
        if (target.includes('username')) {
          throw new BizException(BizCode.USERNAME_EXISTS, '用户名已存在');
        }
        if (target.includes('email')) {
          throw new BizException(BizCode.USERNAME_EXISTS, '邮箱已存在');
        }
        throw new BizException(BizCode.USERNAME_EXISTS, '字段重复');
      }
      throw e;
    }
  }

  /**
   * PUT /api/users/:id
   */
  async update(id: number, dto: UpdateUserDto, currentUserId: number) {
    const exist = await this.prisma.user.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    // 不能禁用自己
    if (dto.status === 0 && id === currentUserId) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能禁用自己');
    }
    // 不能改 admin 状态
    if (dto.status !== undefined && exist.username === 'admin') {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能修改超级管理员状态');
    }
    try {
      const u = await this.prisma.user.update({
        where: { id },
        data: {
          nickname: dto.nickname ?? undefined,
          email: dto.email ?? undefined,
          phone: dto.phone ?? undefined,
          avatar: dto.avatar ?? undefined,
          departmentId: dto.departmentId ?? undefined,
          status: dto.status ?? undefined,
          remark: dto.remark ?? undefined,
        },
        include: { roles: { include: { role: true } } },
      });
      return this.toSafeUser(u);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.USERNAME_EXISTS, '邮箱已被占用');
      }
      throw e;
    }
  }

  /**
   * DELETE /api/users/:id
   */
  async delete(id: number, currentUserId: number) {
    const exist = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!exist) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    if (id === currentUserId) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能删除自己');
    }
    if (exist.username === 'admin') {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能删除超级管理员');
    }
    // 软删
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  /**
   * POST /api/users/:id/reset-password
   * 重置密码 + 撤销所有 refresh token
   */
  async resetPassword(id: number, dto: ResetPasswordDto) {
    const exist = await this.prisma.user.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.userToken.updateMany({
        where: { userId: id, revokedAt: null, type: 'refresh' },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { id };
  }

  /**
   * POST /api/users/:id/toggle-status
   * 启用/禁用
   */
  async toggleStatus(id: number, currentUserId: number) {
    const exist = await this.prisma.user.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    if (id === currentUserId) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能禁用自己');
    }
    if (exist.username === 'admin') {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '不能禁用超级管理员');
    }
    const newStatus = exist.status === 1 ? 0 : 1;
    await this.prisma.user.update({
      where: { id },
      data: { status: newStatus },
    });
    return { id, status: newStatus };
  }

  /**
   * POST /api/users/:id/roles
   * 分配角色
   */
  async assignRoles(id: number, dto: AssignRolesDto) {
    const exist = await this.prisma.user.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.USER_NOT_FOUND, '用户不存在');
    }
    if (dto.roleIds.length > 0) {
      const cnt = await this.prisma.role.count({
        where: { id: { in: dto.roleIds } },
      });
      if (cnt !== dto.roleIds.length) {
        throw new BizException(BizCode.PARAM_ERROR, 'roleIds 包含不存在的角色');
      }
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      ...(dto.roleIds.length > 0
        ? [
            this.prisma.userRole.createMany({
              data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
            }),
          ]
        : []),
    ]);
    return { userId: id, roleIds: dto.roleIds };
  }

  /**
   * 脱敏:剥 passwordHash
   */
  private toSafeUser(u: {
    id: number;
    username: string;
    nickname: string | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    departmentId: number | null;
    status: number;
    lastLoginAt: Date | null;
    lastLoginIp: string | null;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
    passwordHash?: string;
    roles?: { role: { id: number; code: string; name: string } }[];
  }) {
    const { passwordHash: _omit, ...rest } = u;
    return {
      ...rest,
      roles:
        u.roles?.map((ur) => ({
          id: ur.role.id,
          code: ur.role.code,
          name: ur.role.name,
        })) ?? [],
    };
  }
}
