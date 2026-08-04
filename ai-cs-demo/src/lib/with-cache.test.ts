import { describe, it, expect, vi } from 'vitest';
import { withCache } from './with-cache';

/**
 * withCache:防 React Strict Mode dev 双调用 effect + HMR 多次 mount 重复请求
 *
 * 这 spec 锁住"promise-level dedupe + 失败可重试"语义,防后续重构破坏不变量。
 * 任何改动要保证:
 * 1. 同一 lifetime 内多次调,只 1 次真请求
 * 2. 并发调用共享同一 in-flight promise
 * 3. 失败 reset cache,下次可重试
 */
describe('withCache', () => {
  it('Scenario 1: 多次顺序调用,只执行 1 次 fetcher,结果一致', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const get = withCache(fetcher);

    const r1 = await get();
    const r2 = await get();
    const r3 = await get();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toBe('data');
    expect(r2).toBe('data');
    expect(r3).toBe('data');
  });

  it('Scenario 2: 并发调用共享同一 in-flight promise,只发 1 次请求', async () => {
    let resolveFn: (v: string) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolveFn = r;
        }),
    );
    const get = withCache(fetcher);

    const p1 = get();
    const p2 = get();
    const p3 = get();

    // 3 个并发,但 fetcher 只调 1 次
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFn('result');
    expect(await p1).toBe('result');
    expect(await p2).toBe('result');
    expect(await p3).toBe('result');
  });

  it('Scenario 3: 首次失败后 cache reset,下次可重试(不永久卡死)', async () => {
    let attempt = 0;
    const fetcher = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error('boom');
      return 'ok';
    });
    const get = withCache(fetcher);

    await expect(get()).rejects.toThrow('boom');
    // 关键断言:失败后再次调用,会重新发起请求(attempt 变 2)
    expect(await get()).toBe('ok');
    expect(attempt).toBe(2);
  });

  it('Scenario 4: 失败时所有并发调用都 reject,reject 后 cache 也 reset', async () => {
    let rejectFn: (e: Error) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<string>((_, r) => {
          rejectFn = r;
        }),
    );
    const get = withCache(fetcher);

    const p1 = get();
    const p2 = get();
    expect(fetcher).toHaveBeenCalledTimes(1);

    rejectFn(new Error('fail'));
    await expect(p1).rejects.toThrow('fail');
    await expect(p2).rejects.toThrow('fail');

    // 关键断言:reject 后 cache 已 reset,下次可重试
    fetcher.mockResolvedValue('ok' as never);
    expect(await get()).toBe('ok');
  });
});
