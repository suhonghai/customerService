import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * 走软删除的 model 集合(参考 docs/erp-admin/02-database-design.md 4.1)
 *
 * 关键:
 * - 所有业务表带 `deleted_at` 字段(Prisma 命名 `deletedAt`,SQL 列 `deleted_at`)
 * - Prisma 中间件用 snake_case 字段名(直接拼到 SQL WHERE)
 * - findUnique / findFirst / findMany 自动过滤 `deleted_at IS NULL`
 * - delete 自动转 update `deleted_at = NOW()`
 * - count / aggregate / groupBy 同样处理
 */
const SOFT_DELETE_MODELS = new Set<Prisma.ModelName>([
  'User',
  'Role',
  'Menu',
  'Order',
  'FaqDocument',
  'AiModelConfig',
  'AiPromptTemplate',
  'DictType',
  'DictItem',
  'CsSession', // Day 8: 会话 GDPR 软删
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected to MySQL');
    this.useSoftDelete();
    this.logger.log(
      `🛡️  Soft delete middleware active for ${SOFT_DELETE_MODELS.size} models`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Prisma disconnected');
  }

  /**
   * 把软删除过滤装到 Prisma client 上(Day 2 启用)
   *
   * 覆盖:
   * - read(7 个):findUnique / findUniqueOrThrow / findFirst / findFirstOrThrow / findMany / count / aggregate / groupBy
   * - write:delete / deleteMany 转 update / updateMany 带 `deletedAt = NOW()`
   *
   * 重要:Prisma Client API 用 camelCase 字段(`deletedAt`),SQL 列名是 snake_case(`deleted_at`)
   * Prisma 内部做映射,中间件只能用 camelCase
   */
  useSoftDelete(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = this;

    client.$use(async (params: Prisma.MiddlewareParams, next: (p: Prisma.MiddlewareParams) => Promise<unknown>) => {
      if (!params.model || !SOFT_DELETE_MODELS.has(params.model as Prisma.ModelName)) {
        return next(params);
      }

      const readActions = new Set([
        'findUnique',
        'findUniqueOrThrow',
        'findFirst',
        'findFirstOrThrow',
        'findMany',
        'count',
        'aggregate',
        'groupBy',
      ]);

      if (readActions.has(params.action)) {
        params.args = params.args ?? {};
        params.args.where = this.mergeDeletedAtFilter(params.args.where);
      }

      if (params.action === 'delete') {
        params.action = 'update';
        params.args = params.args ?? {};
        params.args.data = { ...(params.args.data ?? {}), deletedAt: new Date() };
      }

      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        if (params.args && params.args.where) {
          params.args.where = this.mergeDeletedAtFilter(params.args.where);
        }
        params.args = params.args ?? {};
        params.args.data = { ...(params.args.data ?? {}), deletedAt: new Date() };
      }

      return next(params);
    });
  }

  /**
   * 把 `deletedAt: null` 合并到现有 where(若调用方已显式带 deletedAt,优先用调用方的)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mergeDeletedAtFilter(where: any): any {
    if (!where) return { deletedAt: null };
    if (where.deletedAt !== undefined) return where;
    return { ...where, deletedAt: null };
  }
}
