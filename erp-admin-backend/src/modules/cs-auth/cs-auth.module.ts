import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CsAuthController } from './cs-auth.controller';
import { CsAuthService } from './cs-auth.service';
import { CS_TOKEN_TTL_SEC, JWT_SECRET } from './cs-auth.constants';
import { CsJwtAuthGuard } from '../../common/guards/cs-jwt-auth.guard';

/**
 * CsAuthModule — 客服前台 (C 端) 独立登录模块
 *
 * 设计原则(S2 拆解自 doc 2026-07-28-cs-customer-decouple):
 * - 与 sys_user 完全解耦:不复用 User / role / permission,自管 cs_customer 表
 * - JWT payload.type='cs_customer',与现有 access token 完全隔离
 * - cookie key `cs_access_token` 与现有 `access_token` 不重名,可同时下发
 * - Guard 直接 verify cookie JWT(不依赖 passport strategy),轻量自洽
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || JWT_SECRET,
        signOptions: { expiresIn: `${CS_TOKEN_TTL_SEC}s` },
      }),
    }),
  ],
  controllers: [CsAuthController],
  providers: [CsAuthService, CsJwtAuthGuard],
  exports: [CsAuthService, CsJwtAuthGuard],
})
export class CsAuthModule {}
