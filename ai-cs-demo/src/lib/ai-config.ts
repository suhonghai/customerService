import { getErpAdminClient, type ActiveAiConfig } from './erp-admin-client'
import { isTest } from './env'

/**
 * AI 配置缓存(Day 9)
 *
 * - 启动时拉一次 erp-admin 的 active AI 配置
 * - 1 小时过期重新拉(配置变化能感知,不会太频繁)
 * - 失败时:启动阶段抛;运行阶段降级,保留旧配置 + warn
 *
 * 使用:
 *   const cfg = await getActiveAiConfig()
 *   const model = createOpenAICompatible({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey })(cfg.modelId)
 */

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 小时

let cached: ActiveAiConfig | null = null;
let lastFetch = 0;

export async function getActiveAiConfig(
  opts: { force?: boolean } = {},
): Promise<ActiveAiConfig> {
  const now = Date.now();
  const expired = now - lastFetch > REFRESH_INTERVAL_MS;
  if (opts.force || !cached || expired) {
    const client = getErpAdminClient();
    const fresh = await client.getActiveAiConfig();
    cached = fresh;
    lastFetch = now;
    if (!isTest) {
      console.log(
        `[ai-config] refresh: modelId=${fresh.modelId} provider=${fresh.provider} baseUrl=${fresh.baseUrl}`,
      );
    }
  }
  return cached!;
}

export function peekCachedAiConfig(): ActiveAiConfig | null {
  return cached;
}
