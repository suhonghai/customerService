/**
 * V1 MCP Client Factory (S8)
 *
 * 拉起一个或多个 MCP server 子进程,合并工具清单。
 *
 * V1 与 W9-10 差异:
 *   - S6(2026-07-16):路径指向 V1/ai-cs-demo/scripts/mcp-servers/customer-service.ts
 *   - S8(2026-07-16):支持 plugins 数组(多 server),tools 合并去重,
 *     保留 plugins[0] 的同名工具(后注册覆盖前注册,便于本地扩展优先)
 *   - W9-10 用 tsx 跑同一份文件,V1 改后这里路径不变(同一份代码)
 *   - 支持 cfg?: ActiveAiConfig 注入(W9-10 已具备,V1 沿用)
 *
 * 关键点:
 *   - 每请求 new 一组 client,流式结束 finally close(子进程释放,防止 fd 泄漏)
 *   - server 路径相对 cwd 解析,所以传 process.cwd() 让 client 跟 Next.js dev server 同 cwd
 *   - 启动失败统一走 toUserMessage → UserFacingError
 *   - 支持 cfg 注入(apiKey / baseUrl / modelId)到 MCP 子进程 env,
 *     让子进程的 src/lib/rag.ts 的 embedding 调用走真正的 active 配置
 *
 * V1 范围(S8):
 *   - 不做 plugin 热加载 — plugins 列表在调用 createMcpStdioClient 时确定
 *   - 多 server 时,每个 server 一个独立 stdio 子进程
 *   - tools 合并策略:同名工具,后面的 server 覆盖前面的 server
 *     (理由:本阶段只 1 个 server;后续多 server 时,业务 server 应在 plugin server 之后
 *      注册,以便业务扩展覆盖默认实现)
 */

import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { toUserMessage } from '@/lib/errors';
import type { ActiveAiConfig } from '@/lib/erp-admin-client';
import { env, isTest } from '@/lib/env';

/** 单个 MCP server 的拉起配置 */
export interface McpServerConfig {
  /** 相对 cwd 的 server 启动脚本(如 'scripts/mcp-servers/customer-service.ts') */
  script: string;
  /** 给这个 server 单独注入的 env(覆盖 process.env) */
  envOverrides?: Record<string, string>;
}

/** 默认 V1 plugins — 1 个 customer-service server */
const DEFAULT_PLUGINS: McpServerConfig[] = [
  {
    script: 'scripts/mcp-servers/customer-service.ts',
  },
];

export async function createMcpStdioClient(
  opts: {
    /** V1.1+ 调用方可传 AbortSignal 串到 MCP 子进程;当前未 wire,先保留 interface 不破坏 caller */
    abortSignal?: AbortSignal;
    cfg?: ActiveAiConfig | null;
    /** V1.1+ 多 server 支持 — 不传则用默认 1 个 customer-service */
    plugins?: McpServerConfig[];
  } = {},
) {
  const cfg = opts.cfg ?? null;
  const plugins = opts.plugins ?? DEFAULT_PLUGINS;

  const baseEnvOverrides: Record<string, string> = {};
  if (cfg) {
    if (cfg.apiKey) baseEnvOverrides.DASHSCOPE_API_KEY = cfg.apiKey;
    if (cfg.baseUrl) baseEnvOverrides.DASHSCOPE_BASE_URL = cfg.baseUrl;
    if (cfg.modelId) {
      baseEnvOverrides.CHAT_MODEL = cfg.modelId;
    }
    if (!isTest) {
      console.log(
        `[mcp-client] V1 injecting active config into subprocess: modelId=${cfg.modelId} provider=${cfg.provider}`,
      );
    }
  }

  try {
    // 1) 顺序拉起每个 server 子进程
    const clients: Array<{
      client: Awaited<ReturnType<typeof createMCPClient>>;
      script: string;
    }> = [];
    for (const plugin of plugins) {
      const client = await createMCPClient({
        transport: new Experimental_StdioMCPTransport({
          command: 'npx',
          args: ['tsx', plugin.script],
          env: {
            ...(process.env as Record<string, string>),
            ...baseEnvOverrides,
            ...(plugin.envOverrides ?? {}),
          },
        }),
      });
      clients.push({ client, script: plugin.script });
    }

    return {
      clients,
      /**
       * 合并所有 server 的 tools。同名时后面的 server 覆盖前面的(server 顺序决定优先级)。
       * 注:`{ [name]: CoreTool }` 结构跟本地工具一致,可以直接 spread 到 streamText({ tools })。
       */
      listTools: async () => {
        const merged: Record<string, unknown> = {};
        for (const { client } of clients) {
          const tools = await client.tools();
          Object.assign(merged, tools);
        }
        return merged;
      },
      /** 列出当前拉起的 plugins(调试 / 排查用) */
      listPlugins: () => clients.map((c) => c.script),
      /** 关闭所有子进程 */
      close: async () => {
        await Promise.allSettled(clients.map((c) => c.client.close()));
      },
    };
  } catch (err: unknown) {
    throw toUserMessage(err);
  }
}

// 内部 _ 用 — 防止 lint 报 env 未用
void env;
