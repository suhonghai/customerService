import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * MetricsService(W11 Day 10)
 *
 * - 暴露 prom-client Registry(默认 + collectDefaultMetrics)
 * - 封装 HTTP 请求相关 metric:
 *   - http_requests_total (counter, labels: method/route/status_code)
 *   - http_request_duration_seconds (histogram, labels: method/route/status_code)
 *
 * 暴露 /api/metrics 端点时,返回 register.metrics() 即可。
 */
@Injectable()
export class MetricsService {
  readonly register: Registry;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;

  constructor() {
    this.register = new Registry();

    // 默认 metric:process_cpu / process_resident_memory / nodejs_eventloop_lag ...
    collectDefaultMetrics({ register: this.register });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests processed, labeled by method, route and status code.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds, labeled by method, route and status code.',
      labelNames: ['method', 'route', 'status_code'],
      // 与 prom-client 推荐对齐:P50/P90/P99
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.register],
    });
  }

  /**
   * 记录一次 HTTP 请求。供 MetricsInterceptor 在 next.handle() 完成后调用。
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSec: number,
  ): void {
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSec);
  }

  /**
   * Prometheus text 格式输出。
   * contentType 是 Prometheus 官方推荐的 text/plain; version=0.0.4。
   */
  async snapshot(): Promise<{ contentType: string; body: string }> {
    const body = await this.register.metrics();
    return {
      contentType: this.register.contentType,
      body,
    };
  }
}