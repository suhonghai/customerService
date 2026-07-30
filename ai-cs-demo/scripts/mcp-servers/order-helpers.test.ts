/**
 * order-helpers 单测(S6)
 *
 * 覆盖:
 *   - isOrderIdSafe:合法 / 非法(注入攻击 / 超长 / 特殊字符)
 *   - backendPayStatusToLabel:6 种状态映射
 *   - backendOrderToMcp:数值类型转换 / 字段重命名
 */

import { describe, expect, it } from 'vitest'
import {
  backendOrderToMcp,
  backendPayStatusToLabel,
  isOrderIdSafe,
} from './order-helpers'

describe('isOrderIdSafe', () => {
  it('合法订单号 #001', () => {
    const r = isOrderIdSafe('#001')
    expect(r.safe).toBe(true)
    expect(r.normalized).toBe('001')
  })

  it('合法订单号 123(无 #)', () => {
    const r = isOrderIdSafe('123')
    expect(r.safe).toBe(true)
    expect(r.normalized).toBe('123')
  })

  it('合法订单号 #20260710001(11 位)', () => {
    const r = isOrderIdSafe('#20260710001')
    expect(r.safe).toBe(true)
    expect(r.normalized).toBe('20260710001')
  })

  it('空字符串:拒绝', () => {
    const r = isOrderIdSafe('')
    expect(r.safe).toBe(false)
    expect(r.reason).toContain('不能为空')
  })

  it('超长(>20):拒绝', () => {
    const r = isOrderIdSafe('#12345678901234567890') // 21 位
    expect(r.safe).toBe(false)
    expect(r.reason).toContain('过长')
  })

  it('注入攻击 #../etc/passwd:拒绝', () => {
    const r = isOrderIdSafe('#../etc/passwd')
    expect(r.safe).toBe(false)
  })

  it('注入攻击 #../../:拒绝', () => {
    const r = isOrderIdSafe('#../../')
    expect(r.safe).toBe(false)
  })

  it('含空格:拒绝', () => {
    const r = isOrderIdSafe('#001 ')
    expect(r.safe).toBe(false)
    // 空格在第一道正则(^#?\d{3,}$)就拦截了,reason 是 "格式错误"
    expect(r.reason).toMatch(/格式错误|非法字符/)
  })

  it('含斜杠:拒绝', () => {
    const r = isOrderIdSafe('#001/2')
    expect(r.safe).toBe(false)
  })

  it('两位数字(00):拒绝(必须 ≥3 位)', () => {
    const r = isOrderIdSafe('00')
    expect(r.safe).toBe(false)
    expect(r.reason).toContain('格式错误')
  })

  it('中文:拒绝', () => {
    const r = isOrderIdSafe('#订单')
    expect(r.safe).toBe(false)
  })
})

describe('backendPayStatusToLabel', () => {
  it('payStatus=3 → 退款中(优先)', () => {
    expect(backendPayStatusToLabel(3, 2)).toBe('退款中')
    expect(backendPayStatusToLabel(3, 3)).toBe('退款中')
  })

  it('orderStatus=1 + payStatus=2 → 已付款', () => {
    expect(backendPayStatusToLabel(2, 1)).toBe('已付款')
  })

  it('orderStatus=1 + payStatus=1 → 等待出库', () => {
    expect(backendPayStatusToLabel(1, 1)).toBe('等待出库')
  })

  it('orderStatus=2 → 已发货', () => {
    expect(backendPayStatusToLabel(2, 2)).toBe('已发货')
  })

  it('orderStatus=3 → 已签收', () => {
    expect(backendPayStatusToLabel(2, 3)).toBe('已签收')
  })

  it('orderStatus=4 → 已取消', () => {
    expect(backendPayStatusToLabel(2, 4)).toBe('已取消')
  })

  it('未知状态:返 "未知"', () => {
    expect(backendPayStatusToLabel(99, 99)).toBe('未知')
  })
})

describe('backendOrderToMcp', () => {
  it('正常订单:字符串 → 数字 / 字段重命名', () => {
    const mcp = backendOrderToMcp({
      id: 1,
      orderNo: '001',
      customerName: 'Alice',
      totalAmount: '1299.00',
      payAmount: '1299.00',
      payStatus: 2,
      orderStatus: 1,
      shipNo: null,
      shipCompany: null,
      items: [
        {
          id: 1,
          productId: 'EAR-PRO',
          productName: '耳机',
          price: '1299.00',
          quantity: 1,
          subtotal: '1299.00',
        },
      ],
      createdAt: '2026-07-01T10:00:00Z',
    })
    expect(mcp.id).toBe('001') // 用 orderNo
    expect(mcp.status).toBe('已付款') // payStatus=2, orderStatus=1
    expect(mcp.total).toBe(1299) // string → number
    expect(mcp.items[0].name).toBe('耳机') // productName → name
    expect(mcp.items[0].price).toBe(1299) // string → number
    expect(mcp.trackingNumber).toBeNull()
    expect(mcp.shippingStatus).toBeNull()
  })

  it('已发货订单:trackingNumber + shippingStatus 有值', () => {
    const mcp = backendOrderToMcp({
      id: 2,
      orderNo: '002',
      customerName: 'Bob',
      totalAmount: '2499.00',
      payAmount: '2499.00',
      payStatus: 2,
      orderStatus: 2,
      shipNo: 'SF1234567890',
      shipCompany: '顺丰',
      items: [],
      createdAt: '2026-07-02T10:00:00Z',
    })
    expect(mcp.status).toBe('已发货')
    expect(mcp.trackingNumber).toBe('SF1234567890')
    expect(mcp.shippingStatus).toBe('顺丰 SF1234567890')
  })

  it('已发货但无 shipCompany:shippingStatus 退化为 shipNo', () => {
    const mcp = backendOrderToMcp({
      id: 3,
      orderNo: '003',
      customerName: 'C',
      totalAmount: '100.00',
      payAmount: '100.00',
      payStatus: 2,
      orderStatus: 2,
      shipNo: 'SF999',
      shipCompany: null,
      items: [],
      createdAt: '2026-07-03T10:00:00Z',
    })
    expect(mcp.shippingStatus).toBe('SF999')
  })
})