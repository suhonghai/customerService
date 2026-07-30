import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CsAuthService } from '../../modules/cs-auth/cs-auth.service';
import { CS_ACCESS_TOKEN_COOKIE } from '../../modules/cs-auth/cs-auth.constants';

/**
 * CsJwtAuthGuard — 客服前台 C 端 JWT Guard
 *
 * 与 `JwtAuthGuard` 平行的实现,完全独立:
 * - 只读 `cs_access_token` cookie(不读 `access_token`)
 * - 不依赖 passport / strategy
 * - 校验通过后把 customer 挂到 `request.csCustomer`,供 @CurrentUserCs 读
 * - 失败统一抛 UnauthorizedException('请先登录')
 */
@Injectable()
export class CsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(CsJwtAuthGuard.name);

  constructor(private readonly csAuthService: CsAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[CS_ACCESS_TOKEN_COOKIE];

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    const customer = await this.csAuthService.verifyToken(token);
    if (!customer) {
      throw new UnauthorizedException('请先登录');
    }

    (request as unknown as { csCustomer: unknown }).csCustomer = customer;
    return true;
  }
}
