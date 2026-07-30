import { Global, Module } from '@nestjs/common';
import { LocalFileStorage } from './file-storage.service';

/**
 * FileStorageModule(Common)
 * - 'FILE_STORAGE' token(LocalFileStorage)
 * - 'UPLOAD_DIR' token(从 env 读)
 * - @Global,所有模块直接 @Inject 即可
 */
@Global()
@Module({
  providers: [
    {
      provide: 'FILE_STORAGE',
      useClass: LocalFileStorage,
    },
    {
      provide: 'UPLOAD_DIR',
      useValue: process.env.UPLOAD_DIR || '/tmp/erp-admin-uploads',
    },
    LocalFileStorage,
  ],
  exports: ['FILE_STORAGE', 'UPLOAD_DIR', LocalFileStorage],
})
export class FileStorageModule {}