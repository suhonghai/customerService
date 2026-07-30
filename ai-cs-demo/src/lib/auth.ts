/**
 * V1 S5 终端用户登录 — 客户端认证封装
 *
 * 流程:
 * - 登录表单 → POST /api/cs/auth/login(email + password)
 * - 后端 Set-Cookie:cs_access_token(httpOnly),与 ERP access_token 隔离
 * - 前端只缓存非凭证用户信息,所有 fetch 使用 credentials:'include'
 *
 * 已登录用户访问 /login 时,自动跳回 /
 * 未登录访问 / 时,AuthGuard 跳 /login
 */

export interface AuthUser {
  id: number;
  email: string;
  nickname: string | null;
  phone: string | null;
  roles: string[];
}

type CsAuthUserPayload = Omit<AuthUser, 'roles'> & { roles?: string[] };

export const ACCESS_TOKEN_COOKIE = 'cs_access_token';
const USER_INFO_COOKIE = 'v1_user_info';

function normalizeAuthUser(user: CsAuthUserPayload): AuthUser {
  return {
    ...user,
    roles: Array.isArray(user.roles) ? user.roles : [],
  };
}

function cacheAuthUser(user: AuthUser): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${USER_INFO_COOKIE}=${encodeURIComponent(
    JSON.stringify(user),
  )}; path=/; max-age=7200; SameSite=Lax`;
}

/**
 * 读 cookie(name=value 形式;非 httpOnly 时浏览器 JS 能读到)
 */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearAuthCookies() {
  if (typeof document === 'undefined') return;
  // httpOnly token 由 /api/cs/auth/logout 清理;这里同步清可见缓存及测试态 cookie。
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; Max-Age=0; path=/`;
  document.cookie = `${USER_INFO_COOKIE}=; Max-Age=0; path=/`;
  document.cookie = `v1_refresh_token=; Max-Age=0; path=/`;
}

/**
 * 调 C 端认证接口登录。凭证只写入后端下发的 cs_access_token httpOnly cookie。
 */
export async function loginRequest(
  email: string,
  password: string,
  apiBase: string,
): Promise<AuthUser> {
  const res = await fetch(`${apiBase}/api/cs/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { accessToken: string; customer: CsAuthUserPayload };
  };
  if (!res.ok || json.code !== 0 || !json.data?.customer) {
    throw new Error(json.message || `登录失败: HTTP ${res.status}`);
  }
  const user = normalizeAuthUser(json.data.customer);
  cacheAuthUser(user);
  return user;
}

export async function logoutRequest(apiBase: string): Promise<void> {
  await fetch(`${apiBase}/api/cs/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);
  clearAuthCookies();
}

/**
 * 从 C 端认证接口读取当前顾客;未登录或请求失败均返回 null。
 */
export async function fetchMe(apiBase: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${apiBase}/api/cs/auth/me`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      code?: number;
      data?: CsAuthUserPayload | null;
    };
    if (json.code !== 0 || !json.data) return null;

    const user = normalizeAuthUser(json.data);
    cacheAuthUser(user);
    return user;
  } catch {
    return null;
  }
}

/**
 * 客户端用 user info(id)注入到 chat body。
 *
 * 不在客户端解析 JWT(没密钥,也不该),直接用 userId 数字;
 * 后端 chat 路径通过 /api/internal/cs/sessions 的 userId 字段落到 cs_session.userId,
 * 后续 WS / 工单流转可据此关联。
 *
 * W11:对 C 端登录用户,这个 id 实际是 CsCustomer.id(不是内部 User.id)。
 * 后端 upsertSession 收到这个值时,如果走 C 端路径会写到 cs_session.customerId 而非 userId;
 * 历史原因这里保留 userId 字段名,后端根据登录态分流。
 */
export function getClientUserId(): number | null {
  if (typeof document === 'undefined') return null;
  const cached = readCookie(USER_INFO_COOKIE);
  if (!cached) return null;
  try {
    const u = JSON.parse(decodeURIComponent(cached)) as AuthUser;
    return typeof u.id === 'number' ? u.id : null;
  } catch {
    return null;
  }
}

/**
 * W11:返回 CsCustomer.id(C 端登录用户专属)— 严格区分于内部员工 User.id。
 *
 * 后端 listOrdersBySession 看到这个非空值,会走 Order.customer_id 过滤,
 * 而不是 Order.user_id(避免 CsCustomer.id 撞 User.id 命名空间导致的「看错人订单」bug)。
 */
export function getClientCustomerId(): number | null {
  if (typeof document === 'undefined') return null;
  const cached = readCookie(USER_INFO_COOKIE);
  if (!cached) return null;
  try {
    const u = JSON.parse(decodeURIComponent(cached)) as AuthUser;
    // v1_user_info cookie 里 u.id 对 C 端就是 CsCustomer.id;
    // 内部员工 cookie 不会被这里读到(走的是另一套 cookie / 另一套接口)。
    // 后端靠 customerId 字段是否被填,自动分流:
    //   - 填了 customerId → 走 cs_session.customerId + Order.customer_id 过滤
    //   - 没填 customerId + 填了 userId → 走 cs_session.userId + Order.user_id 过滤(老 admin demo)
    return typeof u.id === 'number' ? u.id : null;
  } catch {
    return null;
  }
}
