import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceHealthDto } from './dto/health-response.dto';

const DEP_TIMEOUT_MS = 3000;

/**
 * HealthService(W11 Day 10)
 *
 * - checkMysql():发 SELECT 1,测 latency,3s 超时
 * - checkChroma():GET /api/v1/heartbeat,3s 超时
 * - checkReadiness():同时跑 mysql + chroma,聚合状态
 * - check():保留向后兼容(走 readiness 同样逻辑)
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async checkMysql(): Promise<ServiceHealthDto> {
    const start = Date.now();
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`MySQL check timeout after ${DEP_TIMEOUT_MS}ms`)),
          DEP_TIMEOUT_MS,
        ),
      );
      await Promise.race([this.prisma.$queryRaw`SELECT 1 AS ok`, timeoutPromise]);
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      this.logger.error(`MySQL health check failed: ${msg}`);
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: msg,
      };
    }
  }

  /**
   * Chroma heartbeat:GET /api/v2/heartbeat,期望 200。
   * chromadb 0.5+ 已弃用 v1 API,客户端默认走 v2,这里保持一致。
   * 故意不用 chromadb 客户端(避免慢初始化),直接用 Node 20+ 内置 fetch。
   */
  async checkChroma(): Promise<ServiceHealthDto> {
    const start = Date.now();
    const baseUrl = this.config.get<string>('CHROMA_URL') || 'http://127.0.0.1:8001';
    const url = `${baseUrl.replace(/\/+$/, '')}/api/v2/heartbeat`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEP_TIMEOUT_MS);
      const resp = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) {
        return {
          status: 'down',
          latencyMs: Date.now() - start,
          error: `HTTP ${resp.status}`,
        };
      }
      // chroma heartbeat 返 {"nanosecond heartbeat": ...};不严格要求 body 内容
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      this.logger.error(`Chroma health check failed: ${msg}`);
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: msg,
      };
    }
  }

  /**
   * readiness 检查:MySQL + Chroma 都 OK 才算 ok
   */
  async checkReadiness(): Promise<{
    status: 'ok' | 'fail';
    uptime: number;
    timestamp: number;
    services: {
      mysql: ServiceHealthDto;
      chroma: ServiceHealthDto;
    };
  }> {
    const [mysql, chroma] = await Promise.all([this.checkMysql(), this.checkChroma()]);
    const allOk = mysql.status === 'ok' && chroma.status === 'ok';
    return {
      status: allOk ? 'ok' : 'fail',
      uptime: process.uptime(),
      timestamp: Date.now(),
      services: { mysql, chroma },
    };
  }

  /**
   * 整体健康检查(向后兼容老路径 /api/health)
   */
  async check(): Promise<{
    status: string;
    uptime: number;
    timestamp: number;
    services: { mysql: ServiceHealthDto; chroma?: ServiceHealthDto };
  }> {
    const ready = await this.checkReadiness();
    return {
      status: ready.status === 'ok' ? 'ok' : 'degraded',
      uptime: ready.uptime,
      timestamp: ready.timestamp,
      services: { mysql: ready.services.mysql, chroma: ready.services.chroma },
    };
  }
}
