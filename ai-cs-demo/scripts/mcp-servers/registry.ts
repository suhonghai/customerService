/**
 * MCP 工具注册中心 (S8)
 *
 * 把多个 MCP server 暴露的工具汇总到一个统一的 registry,
 * 让 AI 看到的是一个一致的工具清单。
 *
 * 设计动机:
 *   - V1 单 MCP server (customer-service) → W9-10 单进程模式够用
 *   - V1.1+ 计划加多个 server (erp-tools / shipping-tools / marketing-tools 等),
 *     需要一个统一的注册中心来汇总
 *   - 社区贡献者加新 MCP server 时,只需要:
 *       1) 实现 tools/<my-tool>.ts
 *       2) customer-service.ts (或新 server) 调用 registry.register()
 *       3) mcp-client.ts 的 plugins 数组加上路径
 *     三步搞定,不需要改核心代码
 *
 * 核心 API:
 *   - register(spec): 把单个工具注册到 registry(自动归类)
 *   - list(): 返回所有已注册工具(去重)
 *   - listByCategory(category): 按分类过滤
 *   - exposeListToolsMeta(): 暴露 __list_tools 元工具(给 AI 看工具清单)
 *   - clear(): 清空 registry(测试用)
 *   - size(): 当前已注册数量
 *
 * V1 决策(S8):
 *   - plugin 热加载不做,只支持启动时注册(McpServer 启动时遍历所有 tools/*.ts)
 *   - 元工具 __list_tools 自动生成(描述+调用方式固定)
 *   - category 自动归类:从 spec.category 取,未指定则为 'custom'
 *   - 不做并发安全(McpServer 是单进程,启动时注册,无并发)
 */

import { z } from 'zod'

/**
 * 工具分类常量 — 跟 customer-service 的 5 工具对应。
 * 社区贡献者加新工具时,推荐用这里已有的分类;没有就传 'custom'。
 */
export const TOOL_CATEGORIES = [
  'order', // 订单查询(查订单 / 查进行中订单)
  'faq', // FAQ 检索(知识库 RAG)
  'ticket', // 工单创建
  'escalation', // 转人工
  'custom', // 社区贡献 / 业务自定义
] as const

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

/**
 * 单个 MCP 工具的注册描述。
 *
 * 不直接存 McpServer.tool() 的回调,因为:
 *   1) registry 是纯数据容器,跟 McpServer 解耦(便于单测)
 *   2) 多个 server 合并工具时,需要去重
 *   3) __list_tools 元工具需要拿到工具的 description / name / category 元信息
 *
 * handler 仍然由调用方(McpServer 注册时)负责,registry 只持有 spec。
 */
export interface ToolSpec {
  /** 工具名(全局唯一,重复 register 同名时后者覆盖) */
  name: string
  /** 工具描述(给 AI 看的,必须中文,简洁) */
  description: string
  /** Zod schema(MCP stdio 协议用,运行时校验参数) */
  schema: z.ZodTypeAny
  /** 分类(自动归类到 category,便于 AI 按分类找工具) */
  category: ToolCategory
  /** 来源 server 名(如 'customer-service',用于多 server 调试 / 排查) */
  source: string
}

/**
 * McpRegistry — 工具注册中心(单例模式)
 *
 * 用法:
 *   const registry = McpRegistry.getInstance()
 *   registry.register({ name: 'search_faq', ..., source: 'customer-service' })
 *   registry.register({ name: 'create_ticket', ..., source: 'customer-service' })
 *
 *   // 给 AI 看可用工具清单
 *   const metaTool = registry.exposeListToolsMeta()
 *
 * 测试用法:
 *   beforeEach(() => McpRegistry.reset())
 *
 * V1 范围:启动时注册,不支持运行时热加载。
 */
export class McpRegistry {
  private static _instance: McpRegistry | null = null

  private tools: Map<string, ToolSpec> = new Map()

  /** 单例 — McpServer 启动时用,确保全局唯一 */
  static getInstance(): McpRegistry {
    if (!McpRegistry._instance) {
      McpRegistry._instance = new McpRegistry()
    }
    return McpRegistry._instance
  }

  /** 测试用 — 重置 singleton + tools map */
  static reset(): void {
    McpRegistry._instance = null
  }

  /**
   * 注册一个工具。同名工具后者覆盖前者(用于多 server 重复场景)。
   */
  register(spec: ToolSpec): void {
    if (!spec.name) {
      throw new Error('[McpRegistry] register: name is required')
    }
    if (!spec.description) {
      throw new Error(`[McpRegistry] register(${spec.name}): description is required`)
    }
    if (!spec.schema) {
      throw new Error(`[McpRegistry] register(${spec.name}): schema is required`)
    }
    if (!spec.source) {
      throw new Error(`[McpRegistry] register(${spec.name}): source is required`)
    }
    if (!TOOL_CATEGORIES.includes(spec.category)) {
      throw new Error(
        `[McpRegistry] register(${spec.name}): unknown category '${spec.category}', allowed: ${TOOL_CATEGORIES.join(', ')}`,
      )
    }
    this.tools.set(spec.name, spec)
  }

  /**
   * 列出所有已注册工具(去重)。
   */
  list(): ToolSpec[] {
    return Array.from(this.tools.values())
  }

  /**
   * 按分类过滤。
   */
  listByCategory(category: ToolCategory): ToolSpec[] {
    return this.list().filter((t) => t.category === category)
  }

  /**
   * 按名称查单个工具(给元工具 __list_tools 调用时用)。
   */
  get(name: string): ToolSpec | undefined {
    return this.tools.get(name)
  }

  /**
   * 当前注册数量。
   */
  size(): number {
    return this.tools.size
  }

  /**
   * 清空 registry(测试用)。
   */
  clear(): void {
    this.tools.clear()
  }

  /**
   * 暴露元工具 __list_tools。
   *
   * 给 AI 看的工具清单 — AI 调用 __list_tools 可以动态查看所有可用工具的
   * name / description / category(便于在多工具环境下不依赖 system prompt)。
   *
   * 元工具本身不注册到 registry(避免递归),返回的是 ToolSpec,调用方
   * 自行把它注册到 McpServer。
   */
  exposeListToolsMeta(): ToolSpec {
    return {
      name: '__list_tools',
      description:
        '返回当前可用的所有 MCP 工具清单(name + description + category + source)。' +
        '用于在对话中确认有哪些工具可用,不依赖系统 prompt。',
      schema: z.object({}),
      category: 'custom',
      source: 'mcp-registry',
    }
  }

  /**
   * 暴露元工具的 handler(返回精简版工具清单)。
   *
   * __list_tools 工具注册到 McpServer 时,execute 指向这个函数。
   */
  handleListTools(): {
    tools: Array<{ name: string; description: string; category: string; source: string }>
    total: number
    byCategory: Record<string, number>
  } {
    const tools = this.list().map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      source: t.source,
    }))
    const byCategory: Record<string, number> = {}
    for (const t of tools) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1
    }
    return { tools, total: tools.length, byCategory }
  }
}

/**
 * 工厂函数 — McpServer 启动时调用,返回已初始化的 singleton。
 * 主要是简化调用方代码:`const reg = getRegistry()`
 */
export function getRegistry(): McpRegistry {
  return McpRegistry.getInstance()
}