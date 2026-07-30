import { Global, Module } from '@nestjs/common';
import { DataScopeService } from './data-scope.service';

@Global()
@Module({
  providers: [DataScopeService],
  exports: [DataScopeService],
})
export class DataScopeModule {}
