/**
 * 前端 session id(字符串,nanoid 生成) → 后端 cs_session 数字 id 的映射。
 *
 * 为什么不存后端直接给前端 id:
 * - 前端用 nanoid 生成的 sessionKey 比后端 auto-increment 数字 id 更适合做 localStorage key
 *   (数字 id 重复概率低但语义上更乱)
 * - 后端 cs_session 表需要 visitorId + sessionKey 联合 upsert,前端无法直接 upsert(没 internal token)
 * - 通过 Next.js 代理层 /api/sessions/upsert 转发,浏览器不用关心鉴权
 *
 * 缓存策略:
 * - localStorage 命中 → 直接返回,不发请求
 * - localStorage miss → POST /api/sessions/upsert 拿后端 id,写回 localStorage
 * - localStorage 异常(quota / 隐私模式)→ 仍然发请求拿 id,只是不缓存
 */

const MAP_KEY = 'cs_backend_session_map_v1'

export function loadBackendMap(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MAP_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function saveBackendMap(map: Record<string, number>) {
  try {
    window.localStorage.setItem(MAP_KEY, JSON.stringify(map))
  } catch {
    // 静默(quota 等)
  }
}

/**
 * upsert session:走 chat route 内部 server-to-server,拿后端数字 id。
 * 命中缓存直接返回;否则打 upsert 端点拿到 id 并写缓存。
 *
 * V1 S5 增量:接受 userId 参数,透传给后端 upsert 端点 → 落到 cs_session.userId。
 */
export async function ensureBackendSession(
  frontendId: string,
  visitorId: string,
  userId?: number | null,
): Promise<number> {
  const cached = loadBackendMap()[frontendId]
  if (cached) return cached
  // 通过 Next.js 代理层转发,因为浏览器拿不到 internal token。
  const res = await fetch('/api/sessions/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionKey: frontendId,
      visitorId,
      userId: typeof userId === 'number' ? userId : undefined,
    }),
  })
  if (!res.ok) throw new Error(`upsert 失败: ${res.status}`)
  const json = await res.json()
  const backendId: number = json.id
  const map = loadBackendMap()
  map[frontendId] = backendId
  saveBackendMap(map)
  return backendId
}