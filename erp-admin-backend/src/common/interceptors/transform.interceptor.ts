import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export interface StandardResponse<T> {
  code: number;
  message: string;
  data: T | null;
  timestamp: number;
  traceId: string;
}

/**
 * TransformInterceptor:把 controller 返回值包装成统一格式
 *
 * {
 *   code: 0,           // 0 成功,其他失败
 *   message: 'ok',
 *   data: T | null,
 *   timestamp: number,
 *   traceId: string
 * }
 */
@Injectable()
export class TransformInterceptor<T = unknown> implements NestInterceptor<T, StandardResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<StandardResponse<T>> {
    const req = context.switchToHttp().getRequest();
    // 透传已有 traceId,没有就生成
    const traceId =
      (req.headers['x-trace-id'] as string) || (req.headers['x-request-id'] as string) || uuidv4();
    // 挂到 res 让客户端能拿到
    const res = context.switchToHttp().getResponse();
    res.setHeader('x-trace-id', traceId);

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data: data === undefined ? null : (data as T),
        timestamp: Date.now(),
        traceId,
      })),
    );
  }
}
