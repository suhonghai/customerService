import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { BizCode } from '../exceptions/biz.exception';

/**
 * PrismaExceptionFilter:把 Prisma 异常映射为业务异常码
 *
 * 映射规则(参考 03-api-spec.md):
 * - P2002(唯一键冲突) → 40001 业务异常(用户名已存在等)
 * - P2001/P2025(记录不存在) → 30001 资源不存在
 * - P2003(外键约束) → 20001 参数错误
 * - 其他 → 50000 服务器异常
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId =
      (request.headers['x-trace-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      uuidv4();

    let code = BizCode.SERVER_ERROR;
    let message = '数据库异常';
    let data: unknown = null;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          // 唯一键冲突
          const target = (exception.meta?.target as string[]) ?? [];
          code = BizCode.USERNAME_EXISTS;
          message = `${target.join(',') || '字段'}已存在`;
          data = { target };
          break;
        }
        case 'P2001':
        case 'P2025': {
          // 记录不存在
          code = BizCode.USER_NOT_FOUND;
          message = '记录不存在';
          break;
        }
        case 'P2003': {
          // 外键约束
          code = BizCode.PARAM_ERROR;
          message = '外键约束失败';
          data = { field: (exception.meta?.field_name as string) ?? null };
          break;
        }
        default: {
          this.logger.error(`Prisma error [${exception.code}]: ${exception.message}`);
          code = BizCode.SERVER_ERROR;
          message = `数据库异常: ${exception.code}`;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      code = BizCode.PARAM_ERROR;
      message = '数据库参数错误';
      this.logger.error(`Prisma validation: ${exception.message}`);
    }

    response.setHeader('x-trace-id', traceId);
    response.status(HttpStatus.OK).json({
      code,
      message,
      data,
      timestamp: Date.now(),
      traceId,
    });
  }
}
