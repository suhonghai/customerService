import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getVisitorId } from './visitor'

describe('getVisitorId', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns a new id when localStorage is empty (miss)', () => {
    const id = getVisitorId()
    expect(id).toBeTruthy()
    expect(id).not.toBe('ssr')
    // 应当写入 localStorage
    expect(window.localStorage.getItem('cs_visitor_id')).toBe(id)
  })

  it('returns the existing id from localStorage (hit)', () => {
    window.localStorage.setItem('cs_visitor_id', 'preset-id-123')
    expect(getVisitorId()).toBe('preset-id-123')
  })

  it('returns existing cached id when localStorage throws on setItem only', () => {
    // 模拟 localStorage 写失败(quota)但读正常:
    // 此时 getVisitorId 读到缓存直接返回,不应该写入 → 即使 setItem throw 也不影响结果
    window.localStorage.setItem('cs_visitor_id', 'cached-when-set-throws')
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(getVisitorId()).toBe('cached-when-set-throws')
  })
})