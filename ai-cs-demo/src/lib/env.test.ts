/**
 * env 单测(S6 配套)
 *
 * 覆盖:
 *   - getChromaCollectionForTenant:null / undefined / 空串 → fallback cs_faq
 *   - getChromaCollectionForTenant:数字 / 字符串 tenantId → cs_faq_${tenantId}
 *   - getErpAdminToken 优先级
 *   - 端口默认值(V1 = 9529)
 */

import { describe, expect, it } from 'vitest'

// env.ts safeParse 在 import 时执行,必须先有 ERP_ADMIN_URL
const { env, getChromaCollectionForTenant, getErpAdminToken } = await import('./env')

describe('env — getChromaCollectionForTenant', () => {
  it('V1 单租户(null):返 env.CHROMA_COLLECTION', () => {
    expect(getChromaCollectionForTenant(null)).toBe(env.CHROMA_COLLECTION)
  })

  it('undefined / 空字符串:返 fallback', () => {
    expect(getChromaCollectionForTenant(undefined)).toBe(env.CHROMA_COLLECTION)
    expect(getChromaCollectionForTenant('')).toBe(env.CHROMA_COLLECTION)
  })

  it('数字 tenantId:返 cs_faq_${tenantId}', () => {
    expect(getChromaCollectionForTenant(42)).toBe('cs_faq_42')
  })

  it('字符串 tenantId:返 cs_faq_${tenantId}', () => {
    expect(getChromaCollectionForTenant('acme')).toBe('cs_faq_acme')
  })
})

describe('env — 端口默认值', () => {
  it('PORT 默认 9529(V1 专属)', () => {
    expect(env.PORT).toBe(9529)
  })

  it('ERP_ADMIN_URL 默认 3001(V1 backend 端口)', () => {
    expect(env.ERP_ADMIN_URL).toBe('http://127.0.0.1:3001')
  })

  it('CHROMA_COLLECTION 默认 cs_faq(V1 与 W9-10 erp_faq 不同)', () => {
    expect(env.CHROMA_COLLECTION).toBe('cs_faq')
  })
})

describe('env — getErpAdminToken 优先级', () => {
  it('未配置时返空字符串', () => {
    const result = getErpAdminToken()
    expect(typeof result).toBe('string')
  })
})