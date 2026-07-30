/**
 * McpRegistry 单测(S8)
 *
 * 覆盖:
 *   - 单例 + reset
 *   - register / list / get / size / clear
 *   - 字段校验:缺 name / desc / schema / source / 非法 category
 *   - 同名工具后者覆盖
 *   - listByCategory 过滤
 *   - exposeListToolsMeta:返回正确的 spec
 *   - handleListTools:聚合统计 + byCategory
 *
 * 测试不依赖 McpServer(纯数据容器测试)。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { McpRegistry, getRegistry } from './registry'

const sampleSchema = z.object({ x: z.string() })

describe('McpRegistry — 单例', () => {
  afterEach(() => McpRegistry.reset())

  it('getInstance 返回同一实例', () => {
    const a = McpRegistry.getInstance()
    const b = McpRegistry.getInstance()
    expect(a).toBe(b)
  })

  it('getRegistry 等价于 getInstance', () => {
    const a = getRegistry()
    const b = McpRegistry.getInstance()
    expect(a).toBe(b)
  })

  it('reset 后再 getInstance 是新实例', () => {
    const a = McpRegistry.getInstance()
    a.register({
      name: 'tmp',
      description: 'tmp',
      schema: sampleSchema,
      category: 'custom',
      source: 'test',
    })
    expect(a.size()).toBe(1)
    McpRegistry.reset()
    const b = McpRegistry.getInstance()
    expect(b).not.toBe(a)
    expect(b.size()).toBe(0)
  })
})

describe('McpRegistry — register / list', () => {
  beforeEach(() => McpRegistry.reset())

  it('register 一个工具,list 能拿到', () => {
    const reg = McpRegistry.getInstance()
    reg.register({
      name: 'tool_a',
      description: '工具 A',
      schema: sampleSchema,
      category: 'order',
      source: 'customer-service',
    })
    expect(reg.size()).toBe(1)
    const tools = reg.list()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('tool_a')
    expect(tools[0].category).toBe('order')
    expect(tools[0].source).toBe('customer-service')
  })

  it('register 多个工具,list 按插入顺序返回', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'a', description: 'A', schema: sampleSchema, category: 'order', source: 's1' })
    reg.register({ name: 'b', description: 'B', schema: sampleSchema, category: 'faq', source: 's1' })
    reg.register({ name: 'c', description: 'C', schema: sampleSchema, category: 'ticket', source: 's2' })
    expect(reg.list().map((t) => t.name)).toEqual(['a', 'b', 'c'])
  })

  it('同名工具后者覆盖(测试多 server 合并去重)', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'x', description: 'first', schema: sampleSchema, category: 'order', source: 's1' })
    reg.register({ name: 'x', description: 'second', schema: sampleSchema, category: 'faq', source: 's2' })
    expect(reg.size()).toBe(1)
    expect(reg.get('x')?.description).toBe('second')
    expect(reg.get('x')?.source).toBe('s2')
  })

  it('get(name) 找不到返 undefined', () => {
    const reg = McpRegistry.getInstance()
    expect(reg.get('nope')).toBeUndefined()
  })

  it('clear 清空所有', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'a', description: 'A', schema: sampleSchema, category: 'order', source: 's1' })
    expect(reg.size()).toBe(1)
    reg.clear()
    expect(reg.size()).toBe(0)
  })
})

describe('McpRegistry — listByCategory', () => {
  beforeEach(() => McpRegistry.reset())

  it('按 category 过滤', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'o1', description: 'd', schema: sampleSchema, category: 'order', source: 's' })
    reg.register({ name: 'o2', description: 'd', schema: sampleSchema, category: 'order', source: 's' })
    reg.register({ name: 'f1', description: 'd', schema: sampleSchema, category: 'faq', source: 's' })
    expect(reg.listByCategory('order').map((t) => t.name)).toEqual(['o1', 'o2'])
    expect(reg.listByCategory('faq').map((t) => t.name)).toEqual(['f1'])
    expect(reg.listByCategory('ticket')).toEqual([])
    expect(reg.listByCategory('custom')).toEqual([])
  })
})

describe('McpRegistry — register 字段校验', () => {
  beforeEach(() => McpRegistry.reset())

  it('缺 name 抛错', () => {
    const reg = McpRegistry.getInstance()
    expect(() =>
      // @ts-expect-error testing runtime guard
      reg.register({ description: 'd', schema: sampleSchema, category: 'order', source: 's' }),
    ).toThrow(/name is required/)
  })

  it('缺 description 抛错', () => {
    const reg = McpRegistry.getInstance()
    expect(() =>
      // @ts-expect-error testing runtime guard
      reg.register({ name: 'x', schema: sampleSchema, category: 'order', source: 's' }),
    ).toThrow(/description is required/)
  })

  it('缺 schema 抛错', () => {
    const reg = McpRegistry.getInstance()
    expect(() =>
      // @ts-expect-error testing runtime guard
      reg.register({ name: 'x', description: 'd', category: 'order', source: 's' }),
    ).toThrow(/schema is required/)
  })

  it('缺 source 抛错', () => {
    const reg = McpRegistry.getInstance()
    expect(() =>
      // @ts-expect-error testing runtime guard
      reg.register({ name: 'x', description: 'd', schema: sampleSchema, category: 'order' }),
    ).toThrow(/source is required/)
  })

  it('非法 category 抛错', () => {
    const reg = McpRegistry.getInstance()
    expect(() =>
      // @ts-expect-error testing runtime guard
      reg.register({ name: 'x', description: 'd', schema: sampleSchema, category: 'fake', source: 's' }),
    ).toThrow(/unknown category/)
  })
})

describe('McpRegistry — __list_tools 元工具', () => {
  beforeEach(() => McpRegistry.reset())

  it('exposeListToolsMeta 返回正确的 spec', () => {
    const reg = McpRegistry.getInstance()
    const meta = reg.exposeListToolsMeta()
    expect(meta.name).toBe('__list_tools')
    expect(meta.category).toBe('custom')
    expect(meta.source).toBe('mcp-registry')
    expect(meta.description).toContain('MCP 工具清单')
    // schema 是 z.object({}),合法 zod schema
    expect(() => meta.schema.parse({})).not.toThrow()
  })

  it('handleListTools:空 registry 时返 total=0', () => {
    const reg = McpRegistry.getInstance()
    const data = reg.handleListTools()
    expect(data.total).toBe(0)
    expect(data.tools).toEqual([])
    expect(data.byCategory).toEqual({})
  })

  it('handleListTools:多工具聚合 + byCategory 统计', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'a', description: 'A', schema: sampleSchema, category: 'order', source: 's1' })
    reg.register({ name: 'b', description: 'B', schema: sampleSchema, category: 'order', source: 's1' })
    reg.register({ name: 'c', description: 'C', schema: sampleSchema, category: 'faq', source: 's2' })
    const data = reg.handleListTools()
    expect(data.total).toBe(3)
    expect(data.tools).toHaveLength(3)
    expect(data.tools[0]).toEqual({
      name: 'a',
      description: 'A',
      category: 'order',
      source: 's1',
    })
    expect(data.byCategory).toEqual({ order: 2, faq: 1 })
  })

  it('handleListTools:返回结构里 name/description/category/source 4 字段', () => {
    const reg = McpRegistry.getInstance()
    reg.register({ name: 'x', description: 'X desc', schema: sampleSchema, category: 'ticket', source: 'svc' })
    const data = reg.handleListTools()
    expect(Object.keys(data.tools[0]).sort()).toEqual(['category', 'description', 'name', 'source'])
  })
})