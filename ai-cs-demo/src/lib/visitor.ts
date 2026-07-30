/**
 * 稳定的访客 id(每浏览器一枚,localStorage 兜底;服务端不感知)。
 *
 * - 客户端:首次调用时尝试用 crypto.randomUUID() 生成,写入 localStorage;后续命中缓存
 * - 服务端(SSR):返回 'ssr',挂载完成后会用真实 id 替换 ref
 * - localStorage 异常(隐私模式 / quota):fallback 到临时 id('v_<ts>_<rand>'),保证不抛错
 */

const VISITOR_KEY = 'cs_visitor_id'

export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = window.localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
}