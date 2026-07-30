import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CS_TOKEN_TTL_SEC, JWT_SECRET } from './cs-auth.constants';

/**
 * CsAuth JWT payload
 * - sub:CsCustomer.id
 * - email:登录邮箱(冗余,便于日志/审计)
 * - type:固定 'cs_customer',与现有 access token 隔离
 */
export interface CsJwtPayload {
  sub: number;
  email: string;
  type: 'cs_customer';
  iat?: number;
  exp?: number;
}

/**
 * 返回给前端的 customer shape(不返 passwordHash)
 */
export interface CsCustomerPublicDto {
  id: number;
  email: string;
  nickname: string | null;
  phone: string | null;
}

/**
 * 登录返回:accessToken + customer
 */
export interface CsAuthLoginDto {
  accessToken: string;
  customer: CsCustomerPublicDto;
}

@Injectable()
export class CsAuthService {
  private readonly logger = new Logger(CsAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/cs/auth/login
   *
   * 流程:
   * 1. 查 csCustomer by email
   * 2. 不存在 / status!==1 → throw UnauthorizedException('邮箱或密码错误')
   * 3. bcrypt.compare(password, passwordHash)
   * 4. 更新 lastLoginAt
   * 5. 签 JWT(payload.type='cs_customer', TTL 7d)
   * 6. 返 { accessToken, customer }
   */
  async login(email: string, password: string): Promise<CsAuthLoginDto> {
    const customer = await this.prisma.csCustomer.findUnique({
      where: { email },
    });

    if (!customer || customer.status !== 1) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const passwordOk = await bcrypt.compare(password, customer.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 更新 lastLoginAt
    await this.prisma.csCustomer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.signAccessToken(customer.id, customer.email);

    return {
      accessToken,
      customer: this.toPublic(customer),
    };
  }

  /**
   * 校验 token + 查 customer
   * - 失败返 null(给 Guard 决定抛什么异常)
   */
  async verifyToken(token: string): Promise<CsCustomerPublicDto | null> {
    let payload: CsJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<CsJwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET') || JWT_SECRET,
      });
    } catch {
      return null;
    }

    if (payload.type !== 'cs_customer' || !payload.sub) {
      return null;
    }

    const customer = await this.prisma.csCustomer.findUnique({
      where: { id: payload.sub },
    });
    if (!customer || customer.status !== 1) {
      return null;
    }
    return this.toPublic(customer);
  }

  /**
   * GET /api/cs/auth/me
   * - 不存在返 null(由 Guard / Controller 决定抛 404 还是 401)
   */
  async me(customerId: number): Promise<CsCustomerPublicDto | null> {
    const customer = await this.prisma.csCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status !== 1) {
      return null;
    }
    return this.toPublic(customer);
  }

  private async signAccessToken(
    customerId: number,
    email: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: customerId, email, type: 'cs_customer' },
      {
        secret: this.config.get<string>('JWT_SECRET') || JWT_SECRET,
        expiresIn: `${CS_TOKEN_TTL_SEC}s`,
      },
    );
  }

  private toPublic(c: {
    id: number;
    email: string;
    nickname: string | null;
    phone: string | null;
  }): CsCustomerPublicDto {
    return {
      id: c.id,
      email: c.email,
      nickname: c.nickname,
      phone: c.phone,
    };
  }
}
