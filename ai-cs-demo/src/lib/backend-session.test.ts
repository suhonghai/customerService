import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadBackendMap,
  saveBackendMap,
  ensureBackendSession,
} from './backend-session'

describe('backend-session', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadBackendMap / saveBackendMap round-trip', () => {
    it('returns empty map when storage is empty', () => {
      expect(loadBackendMap()).toEqual({})
    })

    it('persists a map across calls', () => {
      saveBackendMap({ 'abc': 42, 'def': 99 })
      expect(loadBackendMap()).toEqual({ 'abc': 42, 'def': 99 })
    })

    it('returns empty object when JSON is malformed', () => {
      window.localStorage.setItem('cs_backend_session_map_v1', 'not-json{')
      expect(loadBackendMap()).toEqual({})
    })
  })

  describe('ensureBackendSession', () => {
    it('returns cached backend id without hitting network', async () => {
      saveBackendMap({ 'sess-1': 7 })
      const fetchSpy = vi.spyOn(global, 'fetch')
      const id = await ensureBackendSession('sess-1', 'visitor-1')
      expect(id).toBe(7)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('POSTs /api/sessions/upsert and caches the result', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 123 }), { status: 200 }),
        )
      const id = await ensureBackendSession('sess-fresh', 'visitor-x')
      expect(id).toBe(123)
      expect(fetchSpy).toHaveBeenCalledOnce()
      const [url, init] = fetchSpy.mock.calls[0]
      expect(url).toBe('/api/sessions/upsert')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(init?.body as string)).toEqual({
        sessionKey: 'sess-fresh',
        visitorId: 'visitor-x',
      })
      // 缓存已写入
      expect(loadBackendMap()['sess-fresh']).toBe(123)
    })

    it('throws when upsert returns non-2xx', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('boom', { status: 500 }),
      )
      await expect(ensureBackendSession('sess-x', 'v')).rejects.toThrow(
        /upsert 失败: 500/,
      )
    })
  })
})