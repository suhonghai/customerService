/**
 * V1 S5 auth.ts 单测
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  readCookie,
  clearAuthCookies,
  ACCESS_TOKEN_COOKIE,
  getClientUserId,
} from './auth'

describe('auth helpers', () => {
  beforeEach(() => {
    // jsdom:document.cookie = '' 会追加空 cookie,需清干净
    const cookies = document.cookie.split(';')
    for (const c of cookies) {
      const name = c.split('=')[0].trim()
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      }
    }
  })

  it('readCookie returns null when not set', () => {
    expect(readCookie('not_set')).toBeNull()
  })

  it('readCookie returns value when set', () => {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=abc123; path=/`
    expect(readCookie(ACCESS_TOKEN_COOKIE)).toBe('abc123')
  })

  it('clearAuthCookies clears access + refresh', () => {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=abc; path=/`
    document.cookie = `v1_refresh_token=xyz; path=/`
    clearAuthCookies()
    expect(readCookie(ACCESS_TOKEN_COOKIE)).toBeNull()
    expect(readCookie('v1_refresh_token')).toBeNull()
  })

  it('getClientUserId returns id from cached user info', () => {
    const u = { id: 42, username: 'alice' }
    document.cookie = `v1_user_info=${encodeURIComponent(JSON.stringify(u))}; path=/`
    expect(getClientUserId()).toBe(42)
  })

  it('getClientUserId returns null when no cache', () => {
    expect(getClientUserId()).toBeNull()
  })

  it('getClientUserId returns null on corrupted cache', () => {
    document.cookie = `v1_user_info=not-json; path=/`
    expect(getClientUserId()).toBeNull()
  })
})