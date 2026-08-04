// V11 fix:在所有 import 之前加载 .env.${NODE_ENV} — 否则常量模块(auth/constants.ts)在
// @nestjs/config 异步读 env 之前 evaluate,process.env.JWT_EXPIRES_IN 还是 undefined,
// 退化到 ?? 7200 默认值(JWT 只 2h 频繁过期)。
// 这里用 dotenv 同步加载(不是 NestJS 的 ConfigModule 异步路径),保证 constants.ts 拿得到。
import 'dotenv/config';
import * as nodefs from 'node:fs';
import * as nodepath from 'node:path';
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodepath.resolve(process.cwd(), `.env.${nodeEnv}`);
if (nodefs.existsSync(envFile)) {
  // dotenv/config 只读 .env;多环境用 .env.development 等需手动覆盖
  const content = nodefs.readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditInterceptor } from './modules/audit-log/audit-log.interceptor';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  // 日志目录:生产 /data/logs/erp-admin/,开发 fallback /tmp/erp-admin-app.log
  const logDir = process.env.NODE_ENV === 'production' ? '/data/logs/erp-admin' : '/tmp';
  const logFile = path.join(logDir, 'erp-admin-app.log');
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch {
    // 目录创建失败时由 pino 用 stdout 兜底
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // 切到 nestjs-pino 异步结构化日志(替代 console + 同步写文件)
  // - 控制台:pretty(开发) / JSON(生产)
  // - 文件:开发可写,生产写 /data/logs/erp-admin/app.log
  app.useLogger(app.get(PinoLogger));

  // cookie-parser middleware(让 passport-jwt 能从 cookie 抽 access_token)
  // ai-cs-demo + curl 走 cookie,erp-admin-frontend 走 header,顺序:cookie 优先 → header 兜底
  app.use(cookieParser());

  // 全局前缀 /api
  app.setGlobalPrefix('api');

  // CORS
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 全局 ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局 Filter(顺序很重要:Prisma → Http)
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());

  // 全局 Interceptor
  // 顺序:Logging → Transform → Audit
  // - Logging 打 access log(stdout)
  // - Transform 包响应格式
  // - Audit 写 audit_log 表(只监听写操作)
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    app.get(AuditInterceptor),
  );

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP Admin API')
    .setDescription('W11 ERP 运营后台 API 文档')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 ERP Admin Backend 启动: http://localhost:${port}/api`);
  logger.log(`📚 Swagger:    http://localhost:${port}/api/docs`);
  logger.log(`💚 Health:     http://localhost:${port}/api/health`);
  logger.log(`📝 日志文件:   ${logFile}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
