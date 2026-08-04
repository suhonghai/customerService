import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CsAuthLoginDto, CsAuthService, CsCustomerPublicDto } from './cs-auth.service';
import { CsLoginDto } from './cs-auth.dto';
import { CsJwtAuthGuard } from '../../common/guards/cs-jwt-auth.guard';
import { CurrentUserCs } from '../../common/decorators/user-cs.decorator';
import { CS_ACCESS_TOKEN_COOKIE, CS_TOKEN_TTL_SEC } from './cs-auth.constants';

/**
 * CsAuthController — 客服前台 /api/cs/auth/*
 *
 * 路由前缀:`cs/auth`(已挂在 AppModule 的 `/api` 全局前缀后)
 * 关键差异:
 * - 路径独立(`/api/cs/auth/*`),与 `/api/auth/*` 互不冲突
 * - cookie 独立(`cs_access_token`),与 `access_token` 互不覆盖
 * - payload.type='cs_customer',Guard 严格校验
 */
@ApiTags('客服认证')
@Controller('cs/auth')
export class CsAuthController {
  constructor(private readonly csAuthService: CsAuthService) {}

  @Post('login')
  @HttpCode(200)
  // TODO(throttle):C 端登录需限流,issue #25 跟踪。
  @ApiOperation({ summary: 'C 端登录(邮箱+密码,Set-Cookie cs_access_token)' })
  async login(
    @Body() dto: CsLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CsAuthLoginDto> {
    const result = await this.csAuthService.login(dto.email, dto.password);
    res.cookie(CS_ACCESS_TOKEN_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: CS_TOKEN_TTL_SEC * 1000,
    });
    return result;
  }

  @Get('me')
  @UseGuards(CsJwtAuthGuard)
  @ApiOperation({ summary: '当前 C 端登录用户' })
  async me(
    @CurrentUserCs() customer: CsCustomerPublicDto | undefined,
  ): Promise<CsCustomerPublicDto> {
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }
    return customer;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'C 端登出(清 cs_access_token cookie)' })
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ success: true }> {
    res.clearCookie(CS_ACCESS_TOKEN_COOKIE, { path: '/' });
    return { success: true };
  }
}
