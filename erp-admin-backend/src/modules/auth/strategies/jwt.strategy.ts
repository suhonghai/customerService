import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JWT_SECRET } from '../constants';
import { ICurrentUser } from '../../../common/decorators/user.decorator';

/**
 * JWT payload 结构
 */
export interface JwtPayload {
  sub: number; // userId
  username?: string;
  type: 'access' | 'refresh';
  jti?: string; // 仅 refresh token 有
  iat?: number;
  exp?: number;
}

/**
 * passport-jwt 策略(Day 2 真实实现)
 *
 * 流程:
 * 1. 从 Authorization 抽 Bearer token
 * 2. 用 JWT_SECRET 校验签名
 * 3. payload.sub 查 user(含 roles + menus)
 * 4. 把 user 信息挂到 req.user(供 @CurrentUser() 读)
 * 5. 错误处理:TokenExpired → 10002,JsonWebTokenError → 10001
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET') || JWT_SECRET;
    const cookieExtractor = (req: Request): string | null => {
      const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
      return cookies?.access_token ?? null;
    };
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: false,
    };
    super(options);
  }

  /**
   * 校验通过后调用,返回值挂到 req.user
   */
  async validate(payload: JwtPayload): Promise<ICurrentUser> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('token 无效');
    }

    if (payload.type !== 'access') {
      // /api/auth/* 路由的 JwtAuthGuard 只接受 access token
      throw new UnauthorizedException('token 类型错误');
    }

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
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    // 收集角色 code 列表
    const roles = user.roles.map((ur) => ur.role.code);

    // 收集 permCode 列表(Day 3:供 PermissionGuard 读)
    const permSet = new Set<string>();
    for (const ur of user.roles) {
      for (const rm of ur.role.menus) {
        if (rm.menu.permCode) permSet.add(rm.menu.permCode);
      }
    }

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname ?? undefined,
      email: user.email ?? undefined,
      avatar: user.avatar ?? undefined,
      departmentId: user.departmentId ?? undefined,
      roles,
      permissions: Array.from(permSet),
    };
  }
}
