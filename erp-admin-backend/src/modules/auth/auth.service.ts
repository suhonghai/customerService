import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import {
  ACCESS_TOKEN_TTL_SEC,
  BCRYPT_COST,
  JWT_REFRESH_SECRET,
  JWT_SECRET,
  LOGIN_LOCK,
  REFRESH_TOKEN_TTL_SEC,
} from './constants';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';

/**
 * 登录上下文(供 audit log 写入)
 */
export interface LoginContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/auth/login
   *
   * 流程(参考 04-rbac-model.md 5.5 + 8.3):
   * 1. 查 user(带 roles + role.menus)
   * 2. 检查 lockedUntil > NOW → 抛 40004
   * 3. bcrypt 比对密码
   *    - 失败:failedLoginCount + 1,达 5 → 锁定 15min
   *    - 成功:failedLoginCount = 0,lockedUntil = null
   * 4. 收集 permissions(从 user → role → role_menu → menu.permCode)
   * 5. 签发 access + refresh token
   * 6. refresh token jti 写到 user_token 表
   * 7. 更新 lastLoginAt / lastLoginIp
   * 8. 返 AuthResponseDto
   */
  async login(
    username: string,
    password: string,
    ctx: LoginContext = {},
  ): Promise<AuthResponseDto> {
    // 1) 查 user(注意:软删除中间件已自动过滤 deleted_at,即便被删的用户也查不到)
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        roles: {
          include: {
            role: {
              include: {
                menus: {
                  include: {
                    menu: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 1) {
      throw new BizException(BizCode.USERNAME_EXISTS, '用户名或密码错误');
    }

    // 2) 锁定检查
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new BizException(
        40004,
        `账号已锁定,请 ${remainMin} 分钟后再试`,
      );
    }

    // 3) 密码校验
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      // 失败计数
      const newCount = user.failedLoginCount + 1;
      const updateData: { failedLoginCount: number; lockedUntil?: Date | null } = {
        failedLoginCount: newCount,
      };
      if (newCount >= LOGIN_LOCK.MAX_FAILS) {
        updateData.lockedUntil = new Date(Date.now() + LOGIN_LOCK.LOCK_DURATION_MS);
        updateData.failedLoginCount = 0; // 锁定后清零,解锁时不再触发
        await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
        throw new BizException(
          40004,
          `连续 ${LOGIN_LOCK.MAX_FAILS} 次登录失败,账号锁定 15 分钟`,
        );
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      throw new BizException(
        40001,
        `用户名或密码错误(剩 ${LOGIN_LOCK.MAX_FAILS - newCount} 次机会)`,
      );
    }

    // 4) 成功:清失败计数 + 解锁
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    // 5) 收集 permissions
    const permSet = new Set<string>();
    const menuIdSet = new Set<number>();
    for (const ur of user.roles) {
      for (const rm of ur.role.menus) {
        menuIdSet.add(rm.menuId);
        if (rm.menu.permCode) permSet.add(rm.menu.permCode);
      }
    }
    const permissions = Array.from(permSet);

    // 6) 签 access + refresh
    const accessToken = await this.signAccessToken(user.id, user.username);
    const { token: refreshToken, jti } = await this.signRefreshToken(user.id);

    // 7) 持久化 refresh jti
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);
    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        jti,
        type: 'refresh',
        expiresAt,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    // 8) 更新 lastLogin
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ip ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        roles: user.roles.map((ur) => ur.role.code),
        permissions,
      },
    };
  }

  /**
   * POST /api/auth/refresh
   *
   * 流程:
   * 1. verify refresh token(用 JWT_REFRESH_SECRET)
   * 2. 校验 payload.type === 'refresh' + jti 存在
   * 3. 查 user_token 表(找 jti 记录)
   *    - 不存在 → 10003
   *    - revokedAt 不为空 → 10003
   *    - expiresAt < NOW → 10003
   * 4. 撤销旧 jti(revokedAt = NOW)
   * 5. 签发新的 access + refresh
   * 6. 新 jti 写 user_token
   */
  async refresh(refreshToken: string, ctx: LoginContext = {}): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') || JWT_REFRESH_SECRET,
      });
    } catch {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 无效或已过期');
    }

    if (payload.type !== 'refresh' || !payload.jti || !payload.sub) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 格式错误');
    }

    // 查持久化记录
    const tokenRow = await this.prisma.userToken.findUnique({
      where: { jti: payload.jti },
    });

    if (!tokenRow || tokenRow.type !== 'refresh') {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 不存在');
    }
    if (tokenRow.revokedAt) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 已被撤销');
    }
    if (tokenRow.expiresAt < new Date()) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 已过期');
    }
    if (tokenRow.userId !== payload.sub) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'refresh token 与用户不匹配');
    }

    // 查 user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                menus: { include: { menu: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 1) {
      throw new BizException(BizCode.REFRESH_EXPIRED, '用户不存在或已禁用');
    }

    // 撤销旧 jti
    await this.prisma.userToken.update({
      where: { jti: payload.jti },
      data: { revokedAt: new Date() },
    });

    // 收集 permissions
    const permSet = new Set<string>();
    for (const ur of user.roles) {
      for (const rm of ur.role.menus) {
        if (rm.menu.permCode) permSet.add(rm.menu.permCode);
      }
    }
    const permissions = Array.from(permSet);

    // 签新 token
    const accessToken = await this.signAccessToken(user.id, user.username);
    const { token: newRefresh, jti: newJti } = await this.signRefreshToken(user.id);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        jti: newJti,
        type: 'refresh',
        expiresAt,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        roles: user.roles.map((ur) => ur.role.code),
        permissions,
      },
    };
  }

  /**
   * POST /api/auth/logout
   *
   * 撤销当前 access token 对应的 user 所有未撤销的 refresh token(简化策略)
   * Day 5+ 重置密码场景可走 revokeAllByUserId
   */
  async logout(userId: number): Promise<{ code: number }> {
    await this.prisma.userToken.updateMany({
      where: { userId, revokedAt: null, type: 'refresh' },
      data: { revokedAt: new Date() },
    });
    return { code: 0 };
  }

  /**
   * GET /api/auth/me
   *
   * 返完整 user + 角色 + 菜单树(过滤 type=1 目录 / type=2 菜单,按钮不返) + permissions
   */
  async me(userId: number): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                menus: { include: { menu: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 1) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户不存在或已禁用');
    }

    // 收集 menu + permCode
    const menuMap = new Map<number, MeResponseDto['menus'][number]>();
    const permSet = new Set<string>();

    for (const ur of user.roles) {
      for (const rm of ur.role.menus) {
        const m = rm.menu;
        // 按钮(type=3)不返前端,只贡献 permCode
        if (m.type === 3) {
          if (m.permCode) permSet.add(m.permCode);
          continue;
        }
        if (!menuMap.has(m.id)) {
          menuMap.set(m.id, {
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
        if (m.permCode) permSet.add(m.permCode);
      }
    }

    // 拼菜单树
    const all = Array.from(menuMap.values());
    const byId = new Map(all.map((m) => [m.id, m]));
    const roots: MeResponseDto['menus'] = [];
    for (const m of all) {
      if (m.parentId == null) {
        roots.push(m);
      } else {
        const parent = byId.get(m.parentId);
        if (parent) {
          parent.children.push(m);
        } else {
          roots.push(m); // 孤儿菜单兜底
        }
      }
    }
    // 排序
    const sortTree = (list: MeResponseDto['menus']) => {
      list.sort((a, b) => a.sort - b.sort);
      for (const m of list) {
        if (m.children.length) sortTree(m.children);
      }
    };
    sortTree(roots);

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      avatar: user.avatar,
      roles: user.roles.map((ur) => ({
        id: ur.role.id,
        code: ur.role.code,
        name: ur.role.name,
      })),
      menus: roots,
      permissions: Array.from(permSet).sort(),
    };
  }

  /**
   * PUT /api/auth/password
   */
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户不存在');
    }

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) {
      throw new BizException(BizCode.USERNAME_EXISTS, '旧密码错误');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // 撤销该用户所有未撤销的 refresh token(强制重新登录)
    await this.prisma.userToken.updateMany({
      where: { userId, revokedAt: null, type: 'refresh' },
      data: { revokedAt: new Date() },
    });

    return { code: 0 };
  }

  private async signAccessToken(userId: number, username: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, username, type: 'access' },
      {
        secret: this.config.get<string>('JWT_SECRET') || JWT_SECRET,
        expiresIn: `${ACCESS_TOKEN_TTL_SEC}s`,
      },
    );
  }

  /**
   * 签 refresh token(7d,sub + jti + type='refresh')
   */
  private async signRefreshToken(userId: number): Promise<{ token: string; jti: string }> {
    const jti = uuidv4();
    const token = await this.jwtService.signAsync(
      { sub: userId, jti, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') || JWT_REFRESH_SECRET,
        expiresIn: `${REFRESH_TOKEN_TTL_SEC}s`,
      },
    );
    return { token, jti };
  }
}
