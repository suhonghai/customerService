import { SetMetadata } from '@nestjs/common';

/**
 * @TransformResponse() 装饰器:标记 Controller 方法返回需要被 TransformInterceptor 包装
 * 实际上是默认行为(Day 1 全局 TransformInterceptor 自动包装所有响应)
 * 此装饰器为占位,可未来扩展(比如某些接口需要返回原始数据不包装)
 */
export const TRANSFORM_KEY = 'transform';
export const TransformResponse = (skip = false) => SetMetadata(TRANSFORM_KEY, !skip);
