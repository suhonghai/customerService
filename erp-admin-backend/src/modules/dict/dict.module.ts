import { Module } from '@nestjs/common';
import { DictController } from './dict.controller';
import { DictService } from './dict.service';

/**
 * DictModule(Day 8)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - AuditLogModule(@Global,AuditLogService)
 *
 * 接口:
 * - GET    /api/dicts/types             字典类型列表
 * - GET    /api/dicts/:code             指定 code 的项
 * - POST   /api/dicts/types             创建类型
 * - POST   /api/dicts/:code/items       加项
 * - PUT    /api/dicts/items/:id         更新项
 * - DELETE /api/dicts/items/:id         软删项
 */
@Module({
  controllers: [DictController],
  providers: [DictService],
  exports: [DictService],
})
export class DictModule {}
