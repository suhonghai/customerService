import { Module } from '@nestjs/common';
import { FileController } from './file.controller';

/**
 * FileModule(Day 9)
 *
 * 通用文件下载:GET /api/files/*
 *
 * - 鉴权由 FileAuthGuard 复合(JwtAuthGuard || InternalGuard)
 * - 文件元数据从 file_meta 表查
 * - 物理文件读自 UPLOAD_DIR(由 CommonServicesModule 的 FileStorageModule 提供)
 *
 * 不需要 prisma 单独 import(PrismaModule @Global)
 */
@Module({
  controllers: [FileController],
  providers: [],
  exports: [],
})
export class FileModule {}
