import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto/health-response.dto';

/**
 * HealthController(W11 Day 10)
 *
 * 三个端点:
 * - GET /api/health/live  : k8s liveness — 进程是否活着(永远 200,除非进程完全挂掉)
 * - GET /api/health/ready : k8s readiness — 依赖(MySQL + Chroma)是否 OK
 * - GET /api/health       : 旧的健康检查(向后兼容 = readiness 同样的逻辑)
 *
 * 注:
 * - live 用 @Res() 透传,不进 TransformInterceptor(避免被包成 {code,data,...} JSON 形状)
 *   因为 k8s / Prometheus 期望简单 JSON / 文本即可
 * - ready 用 @Res() + 自定义 status code:依赖 fail 时返 503
 * - 三个端点都不进 MetricsInterceptor 观测(实际上 interceptor 不易 exclude,这是 Prometheus 客户端
 *   抓 /metrics 自身的常见做法:同一个 endpoint 不会被多次计入。/metrics 端点本身的高频调用被
 *   prom-client 自身采样即可,暂不特殊处理)
 */
@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * k8s liveness:只要进程还在就 OK。哪怕依赖全挂也算 live(k8s 会用 readiness 决定流量)
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'k8s liveness probe - 进程是否活着' })
  @ApiResponse({ status: 200, description: '进程存活' })
  live(@Res() res: Response): void {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
    });
  }

  /**
   * k8s readiness:依赖全 OK 才返 200,否则 503
   */
  @Get('ready')
  @ApiOperation({ summary: 'k8s readiness probe - 依赖(MySQL + Chroma)是否 OK' })
  @ApiResponse({ status: 200, description: '依赖全 OK' })
  @ApiResponse({ status: 503, description: '依赖有失败' })
  async ready(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkReadiness();
    const status = result.status === 'ok' ? 200 : 503;
    res.status(status).json(result);
  }

  /**
   * 兼容老路径 GET /api/health —— 走 readiness 同样逻辑
   */
  @Get()
  @ApiOperation({ summary: '健康检查(兼容老路径,等价 /ready)' })
  @ApiResponse({ status: 200, description: 'ok', type: HealthResponseDto })
  async check(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkReadiness();
    const status = result.status === 'ok' ? 200 : 503;
    res.status(status).json(result);
  }
}
