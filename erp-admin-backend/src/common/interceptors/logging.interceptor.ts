import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

/**
 * LoggingInterceptor(Day 2 简化版)
 *
 * - 只打 stdout 日志(nestjs-pino 自动异步结构化日志,主流程之外)
 * - 此处负责打 access log(method/path/status/latency)
 * - 不再同步写文件(避免高并发阻塞,见 Day 1 subagent 报告)
 *
 * traceId 集成(Day 3 增强):
 * - TransformInterceptor 已经 setHeader('x-trace-id', ...),req 上挂到 res 上
 * - 此处可从 req.headers['x-trace-id'] 读(若客户端有传)
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();
    const { method, originalUrl: path, ip } = req;

    return next.handle().pipe(
      tap(() => {
        const latency = Date.now() - start;
        const status = res.statusCode;
        this.logger.log(`${method} ${path} ${status} ${latency}ms ip=${ip}`);
      }),
      catchError((err) => {
        const latency = Date.now() - start;
        const status = err?.status ?? 500;
        this.logger.error(
          `${method} ${path} ${status} ${latency}ms ip=${ip} err="${err?.message ?? 'unknown'}"`,
        );
        return throwError(() => err);
      }),
    );
  }
}
