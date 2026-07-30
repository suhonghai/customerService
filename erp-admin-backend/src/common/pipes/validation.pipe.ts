import { ValidationPipe, Injectable } from '@nestjs/common';

/**
 * 全局 ValidationPipe(Day 1 简化版)
 *
 * Day 1 行为:实际由 main.ts 全局 useGlobalPipes(new ValidationPipe(...)) 接管
 * 此文件保留为可被局部使用的版本(若某个 controller 想自定义规则)
 *
 * 实际全局规则(main.ts 里):
 * - whitelist: true(只保留 DTO 声明的字段)
 * - forbidNonWhitelisted: true(多余字段 400)
 * - transform: true(自动转 DTO 实例)
 * - transformOptions.enableImplicitConversion: true(自动类型转换)
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
  }
}
