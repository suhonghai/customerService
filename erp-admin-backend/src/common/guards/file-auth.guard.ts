import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { BizException, BizCode } from '../exceptions/biz.exception';

/**
 * FileAuthGuard(Day 9)
 *
 * 通用文件下载鉴权:任一通过即可
 * 1. Authorization: Bearer <jwt>  → JwtAuthGuard 同等行为(自己实现 handleRequest 避免 DI)
 * 2. X-Internal-Token: <token>     → InternalGuard 行为
 *
 * 都没带 → 抛 UNAUTHORIZED(10001)
 *
 * 设计:为了不让 FileAuthGuard 依赖 JwtAuthGuard/InternalGuard 的 DI 实例,
 *      我们直接复用 `AuthGuard('jwt')` + `InternalGuard` 内部的"检查逻辑"原语:
 *      - jwt:用 nestjs/passport 的 AuthGuard('jwt') 触发 401(走 passport-jwt 策略)
 *      - internal:用 InternalGuard 实例(框架会 new 一个)
 *
 * 实际:CanActivate 可以返回 boolean | Promise<boolean> | Observable<boolean>
 *      所以把 jwt 委派给 AuthGuard 实例即可(它自己内部 new 一个)
 */

const VALID_INTERNAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class FileAuthGuard implements CanActivate {
  private readonly logger = new Logger(FileAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 优先 internal token(避免给 jwt 鉴权失败信息误导内部调用方)
    if (req.headers['x-internal-token']) {
      return this.checkInternal(req);
    }
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      // 委派给 nestjs-passport 的 AuthGuard('jwt')
      // 失败时它会抛 UnauthorizedException,我们 catch 转 BizException
      const guard = new (class extends AuthGuard('jwt') {
        handleRequest<TUser = unknown>(err: unknown, user: TUser | false, info: unknown): TUser {
          if (user && !err) return user;
          if (info instanceof TokenExpiredError) {
            throw new BizException(BizCode.TOKEN_EXPIRED, 'token 已过期');
          }
          if (info instanceof JsonWebTokenError) {
            throw new BizException(BizCode.UNAUTHORIZED, 'token 无效');
          }
          if (err) {
            throw new BizException(BizCode.UNAUTHORIZED, 'token 无效');
          }
          if (!user) {
            throw new BizException(BizCode.UNAUTHORIZED, '未登录');
          }
          return user;
        }
      })();
      return guard.canActivate(context) as boolean;
    }
    throw new BizException(BizCode.UNAUTHORIZED, '需要登录或 Internal Token');
  }

  private checkInternal(req: {
    headers: Record<string, string>;
    ip?: string;
    socket?: { remoteAddress?: string };
    connection?: { remoteAddress?: string };
  }): boolean {
    const expected = process.env.INTERNAL_TOKEN;
    if (!expected) {
      throw new BizException(BizCode.SERVER_ERROR, 'INTERNAL_TOKEN 未配置');
    }
    const token = req.headers['x-internal-token'] ?? '';
    if (token !== expected) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'Internal token 无效');
    }
    const ip: string =
      (req.ip as string | undefined) ||
      (req.socket?.remoteAddress as string | undefined) ||
      (req.connection?.remoteAddress as string | undefined) ||
      'unknown';
    if (!VALID_INTERNAL_IPS.has(ip)) {
      throw new BizException(BizCode.REFRESH_EXPIRED, `Internal API 仅允许本机访问,当前 IP: ${ip}`);
    }
    return true;
  }
}
