import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogInput {
  userId?: number | null;
  username?: string | null;
  module?: string;
  action?: string;
  resource?: string | null;
  resourceId?: string | null;
  method?: string;
  path?: string;
  params?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  status: number; // 1 成功 / 0 失败
  errorMsg?: string | null;
  costMs?: number;
}

/**
 * AuditLogService:写 audit_log 表(失败不抛,记错误日志)
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          username: input.username ?? null,
          module: input.module ?? 'unknown',
          action: input.action ?? 'unknown',
          resource: input.resource ?? null,
          resourceId: input.resourceId ?? null,
          method: input.method ?? null,
          path: input.path ?? null,
          // Prisma 接受 unknown 然后序列化为 JSON
          params: this.toJson(input.params),
          oldValue: this.toJson(input.oldValue),
          newValue: this.toJson(input.newValue),
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          status: input.status,
          errorMsg: input.errorMsg ?? null,
          costMs: input.costMs ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`audit_log 写入失败: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toJson(v: unknown): any {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v;
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return null;
    }
  }
}
