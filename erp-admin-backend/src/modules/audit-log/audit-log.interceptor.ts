import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request } from 'express';
import { AuditLogService } from './audit-log.service';
import { ICurrentUser } from '../../common/decorators/user.decorator';

const AUDIT_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * AuditInterceptor(Day 2)
 *
 * - 只审计写操作(POST/PUT/DELETE/PATCH)
 * - 拿 req.user(若 JwtAuthGuard 已挂)
 * - 拿 method/path/params/status/costMs
 * - 成功(status=1) / 失败(status=0) 都记
 * - /api/auth/login 失败时:抛 BizException 也记;同时排除 GET 等只读
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor');

  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const shouldAudit = AUDIT_METHODS.has(method);
    if (!shouldAudit) {
      return next.handle();
    }

    const start = Date.now();
    const url = req.originalUrl || req.url;
    const path = req.path || url.split('?')[0];
    const user = (req as Request & { user?: ICurrentUser }).user;

    return next.handle().pipe(
      tap(() => {
        const costMs = Date.now() - start;
        // 异步写(不 await,fire-and-forget)
        void this.audit.create({
          userId: user?.id ?? null,
          username: user?.username ?? null,
          module: this.getModuleFromPath(path),
          action: this.getActionFromMethod(method),
          method,
          path: url,
          // 不写 body 里的 password 字段
          params: this.sanitizeParams(req.body),
          ip: this.getClientIp(req),
          userAgent: (req.headers['user-agent'] as string) ?? null,
          status: 1,
          costMs,
        });
      }),
      catchError((err: unknown) => {
        const costMs = Date.now() - start;
        const errMsg = err instanceof Error ? err.message : 'unknown';
        void this.audit.create({
          userId: user?.id ?? null,
          username: user?.username ?? null,
          module: this.getModuleFromPath(path),
          action: this.getActionFromMethod(method),
          method,
          path: url,
          params: this.sanitizeParams(req.body),
          ip: this.getClientIp(req),
          userAgent: (req.headers['user-agent'] as string) ?? null,
          status: 0,
          errorMsg: errMsg.slice(0, 500),
          costMs,
        });
        return throwError(() => err);
      }),
    );
  }

  private getModuleFromPath(path: string): string {
    // /api/auth/login → auth; /api/users → users
    const segs = path
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean);
    return segs[0] ?? 'unknown';
  }

  private getActionFromMethod(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PUT':
        return 'update';
      case 'PATCH':
        return 'patch';
      case 'DELETE':
        return 'delete';
      default:
        return method.toLowerCase();
    }
  }

  private sanitizeParams(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    // 不写 password / oldPassword / newPassword / refreshToken
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const k of ['password', 'oldPassword', 'newPassword', 'refreshToken']) {
      if (k in clone) clone[k] = '***';
    }
    return clone;
  }

  private getClientIp(req: Request): string | null {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || null;
  }
}
