import { ExecutionContext } from '@nestjs/common';

/**
 * InternalGuard 单元测试
 *
 * 注:`InternalGuard.RULES` 是 static readonly,在模块加载时一次性解析。
 * 因此每个测试需要:
 *   1. 设置 process.env(包含 INTERNAL_TOKEN + 可选 ALLOWED_INTERNAL_IPS)
 *   2. jest.resetModules()
 *   3. 重新 require('./internal.guard')拿到一个新模块实例
 *   4. 跑断言
 *   5. afterEach 恢复 env
 */

interface MockReq {
  ip: string;
  socket: { remoteAddress: string };
  connection: { remoteAddress: string };
  headers: Record<string, string>;
  method: string;
  url: string;
}

const buildCtx = (ip: string, token: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: (): MockReq => ({
        ip,
        socket: { remoteAddress: ip },
        connection: { remoteAddress: ip },
        headers: { 'x-internal-token': token },
        method: 'GET',
        url: '/api/internal/test',
      }),
    }),
  }) as unknown as ExecutionContext;

/**
 * 在指定 env 下加载一份新的 InternalGuard 模块。
 * 注意:此函数只设置 env 并 require,本测试用 beforeEach/afterEach 控制 env 边界。
 */
function loadGuard(): typeof import('./internal.guard').InternalGuard {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./internal.guard') as typeof import('./internal.guard');
  return mod.InternalGuard;
}

describe('InternalGuard', () => {
  const TOKEN = 'unit-test-token-32chars-min-xxxxxxxx';
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // 完全隔离:每个 case 都从 ORIGINAL_ENV 一份干净的拷贝开始
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('INTERNAL_TOKEN 缺失时抛 "INTERNAL_TOKEN 未配置..."', () => {
    process.env.INTERNAL_TOKEN = '';
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('127.0.0.1', 'anything'))).toThrow(
      /INTERNAL_TOKEN 未配置/,
    );
  });

  it('token 不匹配抛 "Internal token 无效"', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('127.0.0.1', 'wrong-token'))).toThrow(
      /Internal token 无效/,
    );
  });

  it('默认白名单:172.31.0.5(模拟 docker bridge IP)放行', () => {
    // 不设 ALLOWED_INTERNAL_IPS → 走默认白名单(含 172.16.0.0/12)
    process.env.INTERNAL_TOKEN = TOKEN;
    delete process.env.ALLOWED_INTERNAL_IPS;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('172.31.0.5', TOKEN))).not.toThrow();
  });

  it('默认白名单:172.16.0.1 也放行(172.16.0.0/12 下边界)', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    delete process.env.ALLOWED_INTERNAL_IPS;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('172.16.0.1', TOKEN))).not.toThrow();
  });

  it('精确 IPv6 本机 ::1 放行', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('::1', TOKEN))).not.toThrow();
  });

  it('精确 IPv4-mapped ::ffff:127.0.0.1 放行', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('::ffff:127.0.0.1', TOKEN))).not.toThrow();
  });

  it('拒绝默认白名单之外的公网 IP 8.8.8.8', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    delete process.env.ALLOWED_INTERNAL_IPS;
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('8.8.8.8', TOKEN))).toThrow(
      /不允许该 IP 访问/,
    );
  });

  it('env 自定义 CIDR 10.0.0.0/24:10.0.0.5 放行、10.0.1.5 拒绝', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    process.env.ALLOWED_INTERNAL_IPS = '127.0.0.1,10.0.0.0/24';
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('10.0.0.5', TOKEN))).not.toThrow();
    expect(() => guard.canActivate(buildCtx('10.0.1.5', TOKEN))).toThrow(
      /不允许该 IP 访问/,
    );
  });

  it('env 自定义精确 IP 列表生效', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    process.env.ALLOWED_INTERNAL_IPS = '127.0.0.1,1.2.3.4';
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    expect(() => guard.canActivate(buildCtx('1.2.3.4', TOKEN))).not.toThrow();
    expect(() => guard.canActivate(buildCtx('172.31.0.5', TOKEN))).toThrow(
      /不允许该 IP 访问/,
    );
  });

  it('非法 IPv4 与非法 CIDR 被跳过,不阻塞其它合法条目', () => {
    process.env.INTERNAL_TOKEN = TOKEN;
    process.env.ALLOWED_INTERNAL_IPS =
      '127.0.0.1,not-an-ip,300.0.0.1,10.0.0.0/99';
    const InternalGuard = loadGuard();
    const guard = new InternalGuard();
    // 合法条目仍生效:127.0.0.1 放行;172.31.0.5 不在自定义白名单 → 拒绝
    expect(() => guard.canActivate(buildCtx('127.0.0.1', TOKEN))).not.toThrow();
    expect(() => guard.canActivate(buildCtx('172.31.0.5', TOKEN))).toThrow(
      /不允许该 IP 访问/,
    );
  });
});
