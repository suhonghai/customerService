import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * MetricsInterceptor(W11 Day 10)
 *
 * - 拦截所有 HTTP 请求,记录 http_request_duration_seconds histogram
 * - 同时打 http_requests_total counter
 * - labels:
 *   - method:HTTP 方法
 *   - route:路由模板(如 'GET /api/users/:id'),避免高基数 URL 爆 metrics
 *   - status_code:HTTP 状态码(字符串)
 *
 * 关于 route:
 *   - 优先用 express 的 req.route?.path(req.baseUrl + req.route.path)
 *   - 兜底用 req.path(去掉 query string),但注意会被 controller 切分,影响聚合
 *
 * 注意:
 *   - 此 interceptor 不"终止"响应,所以仍要让 LoggingInterceptor / TransformInterceptor 生效
 *   - 由于 metrics 是 best-effort,内部异常被吞掉,不影响主请求
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // 仅对 HTTP 生效(留个口子,以后加 WS / RPC 不冲突)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = process.hrtime.bigint();

    const method = (req.method as string) || 'UNKNOWN';
    const route = this.resolveRoute(req, method);

    return next.handle().pipe(
      tap(() => {
        const status = res.statusCode || 0;
        const durationSec = this.elapsedSeconds(start);
        this.safeRecord(method, route, status, durationSec);
      }),
      catchError((err) => {
        const status = err?.status ?? res.statusCode ?? 500;
        const durationSec = this.elapsedSeconds(start);
        this.safeRecord(method, route, status, durationSec);
        return throwError(() => err);
      }),
    );
  }

  private resolveRoute(req: any, method: string): string {
    // 优先 express 路由模板(防高基数)
    // 注意 NestJS 全局 prefix 是 'api',加上 baseUrl
    const baseUrl = (req.baseUrl as string) || '';
    const routePath = req.route?.path as string | undefined;
    if (routePath) {
      return `${method} ${baseUrl}${routePath}`;
    }
    // 兜底:用 req.path(去掉 query)。
    // 高基数场景(参数化的 URL)会被记录成原始 URL,后续可通过 exclude 路由规避。
    const rawPath = (req.path as string) || req.url || 'unknown';
    return `${method} ${rawPath}`;
  }

  private elapsedSeconds(start: bigint): number {
    const diffNs = process.hrtime.bigint() - start;
    // ns -> s,保留浮点
    return Number(diffNs) / 1_000_000_000;
  }

  private safeRecord(method: string, route: string, status: number, durationSec: number): void {
    try {
      this.metricsService.recordHttpRequest(method, route, status, durationSec);
    } catch {
      // metrics 失败不能影响主请求,吞掉
    }
  }
}
