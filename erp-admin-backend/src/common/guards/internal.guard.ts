import { Injectable, Logger, CanActivate, ExecutionContext } from '@nestjs/common';
import { BizException, BizCode } from '../exceptions/biz.exception';

/**
 * InternalGuard(Day 9)
 *
 * 内部服务互调用守卫(erp-admin <-> ai-cs-demo 等同机服务)
 *
 * 双因子:
 * 1. Header `X-Internal-Token: <64 hex>` 必须等于 env.INTERNAL_TOKEN
 * 2. 客户端 IP 必须在白名单(由 env ALLOWED_INTERNAL_IPS 控制,支持 CIDR 与精确 IP)
 *
 * 失败统一抛 10003(REFRESH_EXPIRED,作为 generic auth 失败码,实际 devops 拦截靠 message)
 *
 * 用途:
 *   @UseGuards(InternalGuard)
 *   @Controller('internal')
 *   export class InternalController { ... }
 *
 * 注意:
 * - 不要用 UnauthorizedException(走 passport jwt 通道,内部 API 不需要)
 * - 不写 audit:内部 API 调用很频繁,audit 表会爆
 *
 * --- IP 白名单设计(2026-07-10 演进) ---
 *
 * 早期 hardcoded Set('127.0.0.1','::1','::ffff:127.0.0.1'),W11 接入 ai-cs-demo
 * 容器后发现 docker bridge 默认网段是 172.16.0.0/12(覆盖到 172.31.0.x),
 * 容器源 IP 被拒。修复方案:
 * 1. IP 白名单 env 化:`ALLOWED_INTERNAL_IPS`,逗号分隔,默认含 docker bridge + RFC1918 私有网段。
 * 2. 支持 CIDR(用 `ip-cidr` 库)和精确 IP match(IPv4 + IPv6)。
 * 3. 默认白名单包含:
 *    - 127.0.0.1 / ::1 / ::ffff:127.0.0.1  本机(保留旧行为)
 *    - 172.16.0.0/12                   docker bridge 默认段(172.16 - 172.31)
 *    - 10.0.0.0/8                      RFC1918 私有 A 类
 *    - 192.168.0.0/16                  RFC1918 私有 C 类
 *
 * 生产环境建议通过 .env 显式收紧,例如:
 *   ALLOWED_INTERNAL_IPS=127.0.0.1,::1,172.31.0.0/16
 */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly logger = new Logger(InternalGuard.name);

  /**
   * 默认白名单:本机 + RFC1918 私有段(含 docker bridge 172.16.0.0/12)
   * 解析后冻结在模块加载期;env 变更需要重启进程。
   */
  private static readonly DEFAULT_ALLOWED_ENTRIES: string[] = [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '172.16.0.0/12',
    '10.0.0.0/8',
    '192.168.0.0/16',
  ];

  /**
   * 解析后的白名单规则:
   * - exactIps:精确 IP 集合(fast path,用 Set.has)
   * - cidrs:CIDR 范围数组(顺序匹配,4 不多)
   */
  private static readonly RULES: {
    exactIps: Set<string>;
    cidrs: { contains: (ip: string) => boolean; raw: string }[];
  } = InternalGuard.buildRules();

  /**
   * 从 env.ALLOWED_INTERNAL_IPS 解析白名单规则。
   * 格式:逗号分隔,每条要么是精确 IP(IPv4/IPv6),要么是 CIDR(x.x.x.x/n)。
   */
  private static buildRules(): {
    exactIps: Set<string>;
    cidrs: { contains: (ip: string) => boolean; raw: string }[];
  } {
    const raw = process.env.ALLOWED_INTERNAL_IPS;
    const entries = (
      raw && raw.trim().length > 0
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : InternalGuard.DEFAULT_ALLOWED_ENTRIES
    ).slice();

    const exactIps = new Set<string>();
    const cidrs: { contains: (ip: string) => boolean; raw: string }[] = [];

    for (const entry of entries) {
      if (entry.includes('/')) {
        const cidr = InternalGuard.parseCidr(entry);
        if (cidr) cidrs.push(cidr);
      } else {
        exactIps.add(entry);
      }
    }

    return { exactIps, cidrs };
  }

  /**
   * 极简 CIDR matcher,只支持 IPv4。
   * docker bridge(172.16.0.0/12)、RFC1918(10/8、192.168/16)都是 IPv4,够用。
   * 格式:`a.b.c.d/n`,n ∈ [0,32]。
   */
  private static parseCidr(entry: string): {
    contains: (ip: string) => boolean;
    raw: string;
  } | null {
    const [base, prefixStr] = entry.split('/');
    const prefix = Number(prefixStr);
    if (!base || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
      // eslint-disable-next-line no-console
      console.warn(`[InternalGuard] 跳过非法 CIDR 条目: "${entry}"(期望格式 a.b.c.d/n, 0<=n<=32)`);
      return null;
    }

    const baseParts = base.split('.');
    if (baseParts.length !== 4) {
      // eslint-disable-next-line no-console
      console.warn(`[InternalGuard] 跳过非法 IPv4 CIDR: "${entry}"`);
      return null;
    }
    const baseNum = InternalGuard.ipv4ToNumber(base);
    if (baseNum === null) {
      // eslint-disable-next-line no-console
      console.warn(`[InternalGuard] 跳过非法 IPv4 地址: "${entry}"`);
      return null;
    }

    // /0 表示全网(0.0.0.0/0),无前缀位;/32 表示单一主机。
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (baseNum & mask) >>> 0;

    return {
      raw: entry,
      contains: (ip: string): boolean => {
        const n = InternalGuard.ipv4ToNumber(ip);
        if (n === null) return false;
        return (n & mask) >>> 0 === network;
      },
    };
  }

  /**
   * IPv4 字符串 → 32-bit 无符号整数。返回 null 表示非合法 IPv4 字符串。
   */
  private static ipv4ToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      const v = Number(p);
      if (!Number.isInteger(v) || v < 0 || v > 255) return null;
      // 多段 0 前缀(如 "01")需拒绝,避免绕过 → 严格等于判断
      if (String(v) !== p) return null;
      n = (n * 256 + v) >>> 0;
    }
    return n >>> 0;
  }

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_TOKEN;
    if (!expected) {
      throw new BizException(BizCode.SERVER_ERROR, 'INTERNAL_TOKEN 未配置,InternalGuard 拒绝放行');
    }

    const req = context.switchToHttp().getRequest();
    const token = (req.headers['x-internal-token'] as string | undefined) ?? '';

    if (!token || token !== expected) {
      throw new BizException(BizCode.REFRESH_EXPIRED, 'Internal token 无效');
    }

    // IP 提取:Express 在 trust proxy = false 时,req.ip 可能是 undefined
    // 降级顺序:req.ip → req.socket.remoteAddress → req.connection.remoteAddress
    const rawIp: string =
      (req.ip as string | undefined) ||
      (req.socket?.remoteAddress as string | undefined) ||
      (req.connection?.remoteAddress as string | undefined) ||
      'unknown';

    if (!InternalGuard.isAllowed(rawIp)) {
      throw new BizException(
        BizCode.REFRESH_EXPIRED,
        `Internal API 不允许该 IP 访问,当前 IP: ${rawIp}`,
      );
    }

    this.logger.debug(`internal api ok: ${req.method} ${req.url} from ${rawIp}`);
    return true;
  }

  /**
   * 判定一个 IP 是否在白名单内:
   * 1. 精确 IP 匹配(Set.has)
   * 2. 任一 CIDR 包含
   */
  private static isAllowed(ip: string): boolean {
    if (!ip || ip === 'unknown') return false;
    if (InternalGuard.RULES.exactIps.has(ip)) return true;
    return InternalGuard.RULES.cidrs.some((c) => c.contains(ip));
  }
}
