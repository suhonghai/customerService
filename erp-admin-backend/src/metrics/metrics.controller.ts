import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * MetricsController(W11 Day 10)
 *
 * - GET /api/metrics:Prometheus 抓取端点,返回 text/plain; version=0.0.4
 * - 用 @Res() 透传(不走 TransformInterceptor 包 JSON,因为 Prometheus 期望纯文本)
 * - 从 Swagger 中排除(用 @ApiExcludeController),避免 OpenAPI 文档里塞一大段 prometheus 输出
 */
@ApiTags('监控')
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async metrics(@Res() res: Response): Promise<void> {
    const { contentType, body } = await this.metricsService.snapshot();
    res.setHeader('Content-Type', contentType);
    res.status(200).send(body);
  }
}
