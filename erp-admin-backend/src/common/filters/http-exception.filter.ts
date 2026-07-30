import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { BizCode } from '../exceptions/biz.exception';

/**
 * HttpExceptionFilter:统一所有 HTTP 异常的响应格式
 *
 * {
 *   code: 10001/20001/...,
 *   message: 'xxx',
 *   data: null,
 *   timestamp: number,
 *   traceId: string
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId =
      (request.headers['x-trace-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      uuidv4();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = BizCode.SERVER_ERROR;
    let message = '服务器异常';
    let data: unknown = null;

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const res = exception.getResponse();

      // BizException 走的是 OK status 但 response 内带 bizCode
      if (typeof res === 'object' && res !== null && 'bizCode' in res) {
        const bizRes = res as { bizCode: number; message: string; data?: unknown };
        code = bizRes.bizCode;
        message = bizRes.message;
        data = bizRes.data ?? null;
      } else if (typeof res === 'string') {
        message = res;
        code = this.httpStatusToBizCode(httpStatus);
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || message;
        // class-validator 错误:message 是 string[]
        if (Array.isArray(obj.message)) {
          code = BizCode.PARAM_ERROR;
          message = `参数错误: ${obj.message.join('; ')}`;
        } else {
          code = this.httpStatusToBizCode(httpStatus);
        }
        data = null;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`未捕获异常: ${exception.message}`, exception.stack);
    }

    response.setHeader('x-trace-id', traceId);
    response.status(httpStatus).json({
      code,
      message,
      data,
      timestamp: Date.now(),
      traceId,
    });
  }

  private httpStatusToBizCode(status: number): number {
    switch (status) {
      case 400:
        return BizCode.PARAM_ERROR;
      case 401:
        return BizCode.UNAUTHORIZED;
      case 403:
        return BizCode.FORBIDDEN;
      case 404:
        return BizCode.USER_NOT_FOUND;
      case 500:
        return BizCode.SERVER_ERROR;
      default:
        return BizCode.SERVER_ERROR;
    }
  }
}
