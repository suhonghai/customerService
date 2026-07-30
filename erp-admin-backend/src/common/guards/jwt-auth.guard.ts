import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { BizCode } from '../exceptions/biz.exception';

/**
 * JwtAuthGuard(Day 2 真实实现)
 *
 * 委托给 passport-jwt 校验,token 从 Authorization 抽 Bearer
 * - 校验失败统一抛 BizException,filter 转 10001/10002
 * - 注意:此处 throw UnauthorizedException 后会被 HttpExceptionFilter 捕获并
 *   提取 status 401 → bizCode 10001 UNAUTHORIZED
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (user && !err) {
      return user;
    }

    // 解析错误原因
    if (info instanceof TokenExpiredError) {
      this.logger.debug(`JWT 过期: ${info.message}`);
      throw new UnauthorizedException({
        bizCode: BizCode.TOKEN_EXPIRED,
        message: 'token 已过期,请刷新',
      });
    }
    if (info instanceof JsonWebTokenError) {
      this.logger.debug(`JWT 无效: ${info.message}`);
      throw new UnauthorizedException({
        bizCode: BizCode.UNAUTHORIZED,
        message: 'token 无效',
      });
    }
    if (err) {
      this.logger.debug(`JWT 校验失败: ${err instanceof Error ? err.message : 'unknown'}`);
      throw new UnauthorizedException({
        bizCode: BizCode.UNAUTHORIZED,
        message: 'token 无效',
      });
    }
    if (!user) {
      throw new UnauthorizedException({
        bizCode: BizCode.UNAUTHORIZED,
        message: '未登录',
      });
    }
    return user;
  }
}
