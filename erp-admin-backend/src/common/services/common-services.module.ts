import { Global, Module } from '@nestjs/common';
import { SplitterService } from './splitter.service';
import { EmbeddingService } from './embedding.service';
import { FileStorageModule } from './file-storage.module';

/**
 * CommonServicesModule(Day 5)
 *
 * 聚合"业务通用服务":
 * - SplitterService:文本切片(500+100)
 * - EmbeddingService:百炼 text-embedding-v4
 *
 * FileStorage 单独在 FileStorageModule,因有自己的 provider(包含 'UPLOAD_DIR' token)
 */
@Global()
@Module({
  imports: [FileStorageModule],
  providers: [SplitterService, EmbeddingService],
  exports: [SplitterService, EmbeddingService, FileStorageModule],
})
export class CommonServicesModule {}