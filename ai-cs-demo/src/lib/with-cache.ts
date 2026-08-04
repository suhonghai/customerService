/**
 * withCache:把 fetcher 包成 promise-level dedupe 的函数
 *
 * 用法:
 *   const getStoreInfo = withCache(() => fetch('/api/store-info').then(r => r.json()));
 *   await getStoreInfo(); // 真请求,promise 缓存
 *   await getStoreInfo(); // 命中 cache,不发起新请求
 *
 * 场景:
 * - React 18+ Strict Mode dev 双调用 mount 阶段 effect → 第二次命中 cache
 * - 多个 hook 各自 useEffect mount 时调同一接口 → 全部命中 cache
 * - Fast Refresh / HMR 触发额外 mount → 命中 cache
 *
 * 失败语义:
 * - 首次失败 → cache reset,下次调用重新发起(不永久卡死)
 * - 用 in-flight promise dedupe(失败前多次并发调用也只发 1 次请求,都拿到同一 reject)
 *
 * Lifetime:
 * - module-level state,单页 lifetime 内有效
 * - 浏览器刷新 / 路由 navigation 会重新 evaluate module → cache 重置(正常)
 *
 * Out of scope:
 * - 跨页 / 跨 session 缓存(需要 storage,不在本 helper 范围)
 * - 过期时间(TTL)— 当前场景是"防 mount 重复",数据本身由后端保证一致性
 */
export function withCache<T>(fetcher: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (cached) return cached;
    cached = (async () => {
      try {
        return await fetcher();
      } catch (e) {
        // 失败 reset:不永久缓存 reject
        cached = null;
        throw e;
      }
    })();
    return cached;
  };
}
