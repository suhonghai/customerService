/**
 * 5 工具 handler 单测(S8)
 *
 * 每个工具都通过 deps 注入句柄,所以 mock 简单。
 * 覆盖:
 *   - search_faq:空库 / 正常 hits / 异常
 *   - get_user_order:非法 orderId / 不存在 / 正常 / 异常
 *   - get_active_orders:无 active 订单 / 有 active 订单 / 异常
 *   - create_ticket:纯空格 / 非法 orderId / 正常 / 异常
 *   - escalate_to_human:纯空格 / 短 reason 加 warning / 正常 / 异常
 */

import { describe, expect, it, vi } from 'vitest'
import { executeSearchFaq, searchFaqSpec } from './search-faq'
import { executeGetUserOrder, getUserOrderSpec } from './get-user-order'
import { executeGetActiveOrders, getActiveOrdersSpec } from './get-active-orders'
import { executeCreateTicket, createTicketSpec } from './create-ticket'
import { executeEscalateToHuman, escalateToHumanSpec } from './escalate-to-human'
import { CUSTOMER_SERVICE_TOOL_HANDLERS, CUSTOMER_SERVICE_TOOL_SPECS } from './index'

// ============ search_faq ============

describe('search_faq handler', () => {
  it('spec 字段正确', () => {
    expect(searchFaqSpec.name).toBe('search_faq')
    expect(searchFaqSpec.category).toBe('faq')
    expect(searchFaqSpec.source).toBe('customer-service')
    expect(searchFaqSpec.description).toContain('FAQ')
  })

  it('FAQ 库为空时返 total=0', async () => {
    const result = await executeSearchFaq(
      { query: '退款怎么操作' },
      {
        search: vi.fn(),
        getStoreSize: vi.fn(async () => 0),
        getChromaCollectionForTenant: vi.fn(() => 'cs_faq'),
      },
    )
    expect(result.isError).toBeUndefined()
    const data = JSON.parse(result.content[0].text)
    expect(data.results).toEqual([])
    expect(data.total).toBe(0)
    expect(data.message).toBe('FAQ 库为空')
  })

  it('正常 hits 映射 chunk → results', async () => {
    const result = await executeSearchFaq(
      { query: '退款', topK: 2 },
      {
        search: vi.fn(async () => [
          { chunk: { text: '退款政策 7 天无理由', source: 'faq.md', index: 1 }, score: 0.95 },
          { chunk: { text: '退款流程:订单页申请', source: 'faq.md', index: 2 }, score: 0.85 },
        ]),
        getStoreSize: vi.fn(async () => 100),
        getChromaCollectionForTenant: vi.fn(() => 'cs_faq'),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.results).toHaveLength(2)
    expect(data.results[0].text).toContain('退款政策')
    expect(data.results[0].score).toBe(0.95)
    expect(data.collection).toBe('cs_faq')
  })

  it('tenantId 透传到 collection 解析', async () => {
    const result = await executeSearchFaq(
      { query: 'x', tenantId: 'tenant_a' },
      {
        search: vi.fn(async () => []),
        getStoreSize: vi.fn(async () => 1),
        getChromaCollectionForTenant: vi.fn((tid) => `cs_faq_${tid}`),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.collection).toBe('cs_faq_tenant_a')
  })

  it('异常 → isError + retryable=true', async () => {
    const result = await executeSearchFaq(
      { query: 'x' },
      {
        search: vi.fn(async () => {
          throw new Error('Chroma down')
        }),
        getStoreSize: vi.fn(async () => 1),
        getChromaCollectionForTenant: vi.fn(() => 'cs_faq'),
      },
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.retryable).toBe(true)
    expect(data.message).toContain('Chroma down')
  })
})

// ============ get_user_order ============

describe('get_user_order handler', () => {
  it('spec 字段正确', () => {
    expect(getUserOrderSpec.name).toBe('get_user_order')
    expect(getUserOrderSpec.category).toBe('order')
  })

  it('非法 orderId(注入):UNSAFE_INPUT', async () => {
    const result = await executeGetUserOrder(
      { orderId: '../etc/passwd' },
      {
        getOrderByOrderNo: vi.fn(),
        backendOrderToMcp: vi.fn(),
      },
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('UNSAFE_INPUT')
  })

  it('orderId 合法但 backend 返 null:NOT_FOUND', async () => {
    const result = await executeGetUserOrder(
      { orderId: '#999' },
      {
        getOrderByOrderNo: vi.fn(async () => null),
        backendOrderToMcp: vi.fn(),
      },
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toContain('#999')
  })

  it('正常订单 → backendOrderToMcp 转换', async () => {
    const fakeOrder = { id: 1, orderNo: '001' }
    const mcpOrder = { id: '001', status: '已付款', total: 1299, items: [], trackingNumber: null, shippingStatus: null, createdAt: '2026-07-01' }
    const result = await executeGetUserOrder(
      { orderId: '001' },
      {
        getOrderByOrderNo: vi.fn(async () => fakeOrder),
        backendOrderToMcp: vi.fn(() => mcpOrder),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.order).toEqual(mcpOrder)
  })

  it('backend 抛 404 → NOT_FOUND(不 retryable)', async () => {
    const err = Object.assign(new Error('not found'), { code: 404 })
    err.code = 404
    const result = await executeGetUserOrder(
      { orderId: '#001' },
      {
        getOrderByOrderNo: vi.fn(async () => {
          throw err
        }),
        backendOrderToMcp: vi.fn(),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('NOT_FOUND')
    expect(data.retryable).toBe(false)
  })

  it('backend 抛 500 → INTERNAL(retryable=true)', async () => {
    const err = Object.assign(new Error('boom'), { code: 500 })
    err.code = 500
    const result = await executeGetUserOrder(
      { orderId: '#001' },
      {
        getOrderByOrderNo: vi.fn(async () => {
          throw err
        }),
        backendOrderToMcp: vi.fn(),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.retryable).toBe(true)
  })

  it('getOrderByOrderNo 收到 normalized orderNo(去掉 #)', async () => {
    const getOrderByOrderNo = vi.fn(async () => null)
    await executeGetUserOrder(
      { orderId: '#001' },
      {
        getOrderByOrderNo,
        backendOrderToMcp: vi.fn(),
      },
    )
    expect(getOrderByOrderNo).toHaveBeenCalledWith('001', { tenantId: null })
  })
})

// ============ get_active_orders ============

describe('get_active_orders handler', () => {
  it('spec 字段正确', () => {
    expect(getActiveOrdersSpec.name).toBe('get_active_orders')
    expect(getActiveOrdersSpec.category).toBe('order')
  })

  it('无 active 订单(都是已签收 / 已取消)', async () => {
    const result = await executeGetActiveOrders(
      { sessionKey: 'sk-test-1' },
      {
        listActiveOrders: vi.fn(async () => [
          { id: 1, payStatus: 2, orderStatus: 3 }, // 已签收
          { id: 2, payStatus: 2, orderStatus: 4 }, // 已取消
        ]),
        backendOrderToMcp: vi.fn((o) => ({
          id: String(o.id),
          status: o.orderStatus === 3 ? '已签收' : '已取消',
          createdAt: '',
          items: [],
          total: 0,
          trackingNumber: null,
          shippingStatus: null,
        })),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.orders).toEqual([])
    expect(data.count).toBe(0)
    expect(data.message).toContain('没有进行中的订单')
  })

  it('有 active 订单:已付款 / 已发货 / 等待出库 / 退款中', async () => {
    const result = await executeGetActiveOrders(
      { sessionKey: 'sk-test-1' },
      {
        listActiveOrders: vi.fn(async () => [
          { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
        ]),
        backendOrderToMcp: vi.fn((o) => ({
          id: String(o.id),
          status: ['', '已付款', '已发货', '等待出库', '退款中', '已签收'][o.id] ?? '',
          createdAt: '2026-07-01',
          items: [{ name: '耳机', productId: 'P1', qty: 1, price: 100 }],
          total: 100,
          trackingNumber: o.id === 2 ? 'SF123' : null,
          shippingStatus: o.id === 2 ? '顺丰 SF123' : null,
        })),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.count).toBe(4) // id 5 是已签收,过滤掉
    expect(data.orders.map((o: { id: string }) => o.id)).toEqual(['#1', '#2', '#3', '#4'])
    expect(data.sessionKey).toBe('sk-test-1…')
  })

  it('sessionKey 缺失 → INTERNAL(server-side 注入 bug,不是用户错)', async () => {
    const listActiveOrders = vi.fn()
    const result = await executeGetActiveOrders(
      { sessionKey: '' },
      {
        listActiveOrders,
        backendOrderToMcp: vi.fn(),
      },
    )
    expect(listActiveOrders).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.message).toContain('sessionKey 缺失')
    expect(data.retryable).toBe(true)
  })

  it('sessionKey 透传:listActiveOrders 收到 trimmed sessionKey + status=all + tenantId=null', async () => {
    const listActiveOrders = vi.fn(async () => [])
    await executeGetActiveOrders(
      { sessionKey: '  sk-trim-me  ' },
      {
        listActiveOrders,
        backendOrderToMcp: vi.fn(),
      },
    )
    expect(listActiveOrders).toHaveBeenCalledWith({
      sessionKey: 'sk-trim-me',
      status: 'all',
      tenantId: null,
    })
  })

  it('异常 → INTERNAL + retryable + hint', async () => {
    const result = await executeGetActiveOrders(
      { sessionKey: 'sk-test-1' },
      {
        listActiveOrders: vi.fn(async () => {
          throw new Error('ECONNREFUSED')
        }),
        backendOrderToMcp: vi.fn(),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.retryable).toBe(true)
    expect(data.hint).toContain('ERP_ADMIN_URL')
  })
})

// ============ create_ticket ============

describe('create_ticket handler', () => {
  it('spec 字段正确', () => {
    expect(createTicketSpec.name).toBe('create_ticket')
    expect(createTicketSpec.category).toBe('ticket')
  })

  it('userIssue 纯空格 → INVALID_PARAMS', async () => {
    const result = await executeCreateTicket(
      { userIssue: '   ', priority: 'normal' },
      { createTicket: vi.fn() },
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INVALID_PARAMS')
  })

  it('relatedOrderId 非法 → UNSAFE_INPUT', async () => {
    const result = await executeCreateTicket(
      { userIssue: 'test', relatedOrderId: '../etc' },
      { createTicket: vi.fn() },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('UNSAFE_INPUT')
  })

  it('priority 映射:high=1 / normal=2 / low=3', async () => {
    const createTicket = vi.fn(async () => ({
      id: 1,
      ticketNo: 'T001',
      status: 1,
      slaDeadline: '2026-07-17T10:00:00Z',
    }))
    for (const [priority, expected] of [
      ['high', 1],
      ['normal', 2],
      ['low', 3],
    ] as const) {
      createTicket.mockClear()
      await executeCreateTicket(
        { userIssue: 'test', priority },
        { createTicket },
      )
      expect(createTicket).toHaveBeenCalledWith(
        expect.objectContaining({ priority: expected }),
      )
    }
  })

  it('正常创建 → 返回 ticketId + slaDeadline', async () => {
    const result = await executeCreateTicket(
      { userIssue: '我要退款', priority: 'high', relatedOrderId: '#001' },
      {
        createTicket: vi.fn(async () => ({
          id: 42,
          ticketNo: '20260710001',
          status: 1,
          slaDeadline: '2026-07-17T10:00:00Z',
        })),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.ticketId).toBe('20260710001')
    expect(data.ticketDbId).toBe(42)
    expect(data.status).toBe('pending')
    expect(data.priority).toBe('high')
    expect(data.relatedOrderId).toBe('001')
    expect(data.slaDeadline).toBe('2026-07-17T10:00:00Z')
  })

  it('关联订单号写到 title 前缀', async () => {
    const createTicket = vi.fn(async () => ({ id: 1, ticketNo: 'T', status: 1 }))
    await executeCreateTicket(
      { userIssue: '退款', relatedOrderId: '#001' },
      { createTicket },
    )
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ title: '[#001] 退款' }),
    )
  })

  it('异常 → INTERNAL + retryable + hint', async () => {
    const result = await executeCreateTicket(
      { userIssue: 'test' },
      {
        createTicket: vi.fn(async () => {
          throw new Error('backend 502')
        }),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.retryable).toBe(true)
    expect(data.hint).toContain('ERP_ADMIN_URL')
  })
})

// ============ escalate_to_human ============

describe('escalate_to_human handler', () => {
  it('spec 字段正确', () => {
    expect(escalateToHumanSpec.name).toBe('escalate_to_human')
    expect(escalateToHumanSpec.category).toBe('escalation')
  })

  it('reason 纯空格 → INVALID_PARAMS', async () => {
    const result = await executeEscalateToHuman(
      { reason: '   ', urgency: 'normal' },
      { createEscalation: vi.fn() },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INVALID_PARAMS')
  })

  it('短 reason(<10 字) → 自动追加 warning + 提示回拨', async () => {
    const createEscalation = vi.fn(async () => ({
      ticketId: 1,
      ticketNo: 'E001',
      category: 'escalation',
      slaDeadline: '2026-07-17T10:00:00Z',
    }))
    const result = await executeEscalateToHuman(
      { reason: 'help', urgency: 'normal' },
      { createEscalation },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.warning).toContain('详细描述')
    // content 应该含 "客户描述较简" — 在发给 backend 的 content 里,不是返回给 AI 的 data
    expect(createEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('客户描述较简') }),
    )
  })

  it('urgency=urgent → estimatedWaitMinutes=5 + priority=high', async () => {
    const result = await executeEscalateToHuman(
      { reason: '钱被盗刷了需要紧急冻结', urgency: 'urgent' },
      {
        createEscalation: vi.fn(async () => ({
          ticketId: 1,
          ticketNo: 'E001',
          category: 'escalation',
        })),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.urgency).toBe('urgent')
    expect(data.estimatedWaitMinutes).toBe(5)
    expect(data.priority).toBe('high')
  })

  it('正常 → ticketNo + slaDeadline + category=escalation', async () => {
    const result = await executeEscalateToHuman(
      { reason: '复杂问题描述很长很长很长很长很长' },
      {
        createEscalation: vi.fn(async () => ({
          ticketId: 7,
          ticketNo: '20260710002',
          category: 'escalation',
          slaDeadline: '2026-07-17T10:00:00Z',
        })),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.ticketNo).toBe('20260710002')
    expect(data.escalationId).toBe('20260710002')
    expect(data.ticketDbId).toBe(7)
    expect(data.category).toBe('escalation')
    expect(data.estimatedWaitMinutes).toBe(15)
  })

  it('异常 → INTERNAL + retryable + hint', async () => {
    const result = await executeEscalateToHuman(
      { reason: 'test' },
      {
        createEscalation: vi.fn(async () => {
          throw new Error('backend unreachable')
        }),
      },
    )
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toBe('INTERNAL')
    expect(data.retryable).toBe(true)
    expect(data.hint).toContain('ERP_ADMIN_URL')
  })
})

// ============ tools/index.ts 集成 ============

describe('tools/index.ts', () => {
  it('CUSTOMER_SERVICE_TOOL_SPECS 包含 5 个工具', () => {
    expect(CUSTOMER_SERVICE_TOOL_SPECS).toHaveLength(5)
    const names = CUSTOMER_SERVICE_TOOL_SPECS.map((s) => s.name)
    expect(names).toEqual([
      'search_faq',
      'get_user_order',
      'get_active_orders',
      'create_ticket',
      'escalate_to_human',
    ])
  })

  it('CUSTOMER_SERVICE_TOOL_HANDLERS 5 个工具都有 handler', () => {
    const handlerNames = Object.keys(CUSTOMER_SERVICE_TOOL_HANDLERS)
    expect(handlerNames).toHaveLength(5)
    for (const spec of CUSTOMER_SERVICE_TOOL_SPECS) {
      expect(handlerNames).toContain(spec.name)
    }
  })

  it('所有 spec 都有 source=customer-service', () => {
    for (const spec of CUSTOMER_SERVICE_TOOL_SPECS) {
      expect(spec.source).toBe('customer-service')
    }
  })

  it('所有 spec 都归到 4 个合法 category', () => {
    const allowed = new Set(['order', 'faq', 'ticket', 'escalation', 'custom'])
    for (const spec of CUSTOMER_SERVICE_TOOL_SPECS) {
      expect(allowed.has(spec.category)).toBe(true)
    }
  })
})