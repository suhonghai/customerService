import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CsAuthModule } from './modules/cs-auth/cs-auth.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { DataScopeModule } from './common/services/data-scope.module';
import { CommonServicesModule } from './common/services/common-services.module';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { UserModule } from './modules/user/user.module';
import { RoleModule } from './modules/role/role.module';
import { MenuModule } from './modules/menu/menu.module';
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { AiPromptTemplateModule } from './modules/ai-prompt-template/ai-prompt-template.module';
import { FaqModule } from './modules/faq/faq.module';
import { OrderModule } from './modules/order/order.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { SessionModule } from './modules/session/session.module';
import { StatsModule } from './modules/stats/stats.module';
import { DictModule } from './modules/dict/dict.module';
import { InternalModule } from './modules/internal/internal.module';
import { FileModule } from './modules/file/file.module';
import { WsModule } from './modules/ws/ws.module';

/**
 * 日志目录:生产 /data/logs/erp-admin/,开发 fallback /tmp/erp-admin-app.log
 * mkdir -p(启动时确保目录存在)
 */
const logDir = process.env.NODE_ENV === 'production' ? '/data/logs/erp-admin' : '/tmp';
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch {
  // 目录创建失败时由 pino 用 stdout 兜底
}
const logFile = path.join(logDir, 'erp-admin-app.log');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env', // 兜底
      ],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'uat', 'production')
          .default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        // V11 JWT TTL:dev 7d(避免开发期频繁过期)+ prod 1h(access) / 7d(refresh)
        // prod 部署时通过 env 覆盖:JWT_EXPIRES_IN=3600 + JWT_REFRESH_EXPIRES_IN=604800
        JWT_EXPIRES_IN: Joi.number().default(604800),
        JWT_REFRESH_EXPIRES_IN: Joi.number().default(604800),
        AI_API_KEY_ENCRYPT_KEY: Joi.string().length(64).required(),
        INTERNAL_TOKEN: Joi.string().min(32).required(),
        CHROMA_URL: Joi.string().uri().required(),
        CHROMA_COLLECTION: Joi.string().default('erp_faq'),
        ALLOWED_INTERNAL_IPS: Joi.string().default('127.0.0.1,::1'),
        ALLOWED_ORIGINS: Joi.string().required(),
        LOG_LEVEL: Joi.string()
          .valid('debug', 'info', 'warn', 'error')
          .default('info'),
      }),
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    // nestjs-pino:异步结构化日志,替代默认同步控制台输出 + 同步写文件
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
        // 生产写文件,开发只 stdout
        ...(process.env.NODE_ENV === 'production' && {
          stream: fs.createWriteStream(logFile, { flags: 'a' }),
        }),
        // 自动注入 req.id / req.method / res.statusCode
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        customSuccessMessage: (req, res) => {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        customErrorMessage: (req, res, err) => {
          return `${req.method} ${req.url} ${res.statusCode} ${err.message}`;
        },
        serializers: {
          req(req: { method: string; url: string; remoteAddress: string }) {
            return { method: req.method, url: req.url, ip: req.remoteAddress };
          },
          res(res: { statusCode: number }) {
            return { statusCode: res.statusCode };
          },
        },
      },
    }),
    PrismaModule,
    AuditLogModule, // @Global 全局
    DataScopeModule, // @Global
    CommonServicesModule, // @Global (Splitter / Embedding / FileStorage)
    MetricsModule, // @Global:MetricsService + MetricsInterceptor (APP_INTERCEPTOR)
    AuthModule,
    CsAuthModule, // W11 S2: 客服前台 C 端独立登录(平行 AuthModule,不复用 sys_user)
    HealthModule,
    UserModule,
    RoleModule,
    MenuModule,
    AiConfigModule,
    AiPromptTemplateModule,
    FaqModule,
    OrderModule,
    TicketModule,
    SessionModule, // Day 8
    StatsModule, // Day 8
    DictModule, // Day 8
    InternalModule, // Day 9
    FileModule, // Day 9
    WsModule, // W11 Day 10: WebSocket gateway for operator → customer realtime push
  ],
  providers: [
    // W11 Day 10:全局 metrics interceptor(在 main.ts 的 LoggingInterceptor / TransformInterceptor 之后执行,
    // 因为 APP_INTERCEPTOR 在 useGlobalInterceptors 之前注册)。
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
