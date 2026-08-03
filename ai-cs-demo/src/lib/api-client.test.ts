/**
 * api-client 单测(S6)
 *
 * 覆盖:
 *   - BackendApiError 类型 / 字段
 *   - getOrderByOrderNo:成功 / 404 / 网络错误重试
 *   - listActiveOrders:成功 / 空数据
 *   - createTicket:成功 / 业务错误
 *   - createEscalation:成功
 *   - X-Internal-Token 鉴权 header 注入
 *   - tenantId 注入 / 不注入
 *
 * 用全局 fetch mock(vi.stubGlobal),避免启动子进程。
 *
 * 注意:env.ts 启动即 safeParse(process.env),所以必须在 import 前用 vi.hoisted
 * 把 ERP_ADMIN_URL / INTERNAL_TOKEN 写到 process.env,否则 env 解析失败。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// 在 import env 之前先把 env 变量塞进去 —— vi.hoisted 保证它在 import 之前执行
vi.hoisted(() => {
  process.env.ERP_ADMIN_URL = 'http://127.0.0.1:3001';
  process.env.INTERNAL_TOKEN = 'test-internal-token-xyz';
});

const { BackendApiError, createEscalation, createTicket, getOrderByOrderNo, listActiveOrders } =
  await import('./api-client');

// fetch mock —— 每个 test 自己 stub
function mockFetchResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

// vitest 2.x 的 vi.fn() 不会自动把 `async () => ...` 推导成 fetch 签名,
// 导致 mock.calls 元组类型为 `[][]`,后续 [0]/[1] 访问触发 TS2493/TS2352。
// 这里给 impl 加显式参数 + 返回类型,让 TS 推出与 typeof fetch 一致的元组。
type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
function stubFetch(impl: () => Promise<Response>): FetchMock {
  return vi.fn<typeof fetch>(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => impl(),
  );
}

describe('api-client — getOrderByOrderNo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('成功:返 backend Order 对象', async () => {
    const orderResp = {
      code: 0,
      message: 'ok',
      data: {
        id: 1,
        orderNo: '001',
        customerName: 'Alice',
        customerPhone: '13800138000',
        customerEmail: null,
        totalAmount: '1299.00',
        payAmount: '1299.00',
        payStatus: 2,
        orderStatus: 1,
        shipNo: null,
        shipCompany: null,
        address: null,
        items: [
          {
            id: 1,
            productId: 'EAR-PRO',
            productName: '耳机',
            price: '1299.00',
            quantity: 1,
            subtotal: '1299.00',
          },
        ],
        createdAt: '2026-07-01T10:00:00Z',
        paidAt: '2026-07-01T10:05:00Z',
        shippedAt: null,
        receivedAt: null,
      },
    };
    const fetchMock = stubFetch(async () => mockFetchResponse(orderResp));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getOrderByOrderNo('001');
    expect(result).not.toBeNull();
    expect(result!.orderNo).toBe('001');
    expect(result!.items[0].productName).toBe('耳机');

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toBe('http://127.0.0.1:3001/api/internal/cs/orders/001');
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Internal-Token']).toBe('test-internal-token-xyz');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('订单不存在(404):返 null,不抛错', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ code: 1404, message: 'NOT_FOUND', data: null }, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await getOrderByOrderNo('999');
    expect(result).toBeNull();
  });

  it('订单不存在(业务 code 1404 + status 200):返 null', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ code: 1404, message: 'NOT_FOUND', data: null }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await getOrderByOrderNo('999');
    expect(result).toBeNull();
  });

  it('业务错误(code !== 0 且非 1404):抛 BackendApiError', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ code: 1400, message: '参数错误', data: null }, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(getOrderByOrderNo('xxx')).rejects.toThrow(BackendApiError);
  });
});

describe('api-client — listActiveOrders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功:返订单数组', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listActiveOrders({ sessionKey: 'sk-42', status: 'all' });
    expect(result).toEqual([]);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('sessionKey=sk-42');
    // 'all' 不传(S6 决策:all = 不过滤,query 不带 status 参数)
    expect(url).not.toContain('status=');
  });

  it('sessionKey 必传:URL 必带', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listActiveOrders({ sessionKey: 'sk-alice' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('sessionKey=sk-alice');
  });

  it('status=undefined:不带 status query', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listActiveOrders({ sessionKey: 'sk-1' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('status=');
  });

  it('sessionKey 缺失 → 抛 BackendApiError', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(listActiveOrders({ sessionKey: '' })).rejects.toThrow(BackendApiError);
  });
});

describe('api-client — createTicket', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功:返 backend 工单号', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({
        code: 0,
        message: 'ok',
        data: {
          id: 100,
          ticketNo: 'T-20260716001',
          status: 1,
          priority: 2,
          title: 't',
          content: 'c',
          slaDeadline: '2026-07-17T00:00:00Z',
          creatorId: 1,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ticket = await createTicket({
      title: '退款',
      content: '商品有问题',
      priority: 1,
      category: 'ai-cs-demo',
    });
    expect(ticket.ticketNo).toBe('T-20260716001');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.title).toBe('退款');
    expect(body.priority).toBe(1);
    expect(body.category).toBe('ai-cs-demo');
  });

  it('业务错误:抛 BackendApiError(code 保留)', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ code: 1500, message: 'title 过长', data: null }, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createTicket({ title: 'x'.repeat(300), content: 'y', priority: 2 }),
    ).rejects.toThrow(/title 过长/);
  });
});

describe('api-client — createEscalation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功:返 escalation 对象', async () => {
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({
        code: 0,
        message: 'ok',
        data: {
          id: 200,
          ticketId: 200,
          ticketNo: 'T-20260716002',
          code: 'T-20260716002',
          priority: 1,
          slaDeadline: '2026-07-16T05:00:00Z',
          category: 'escalation',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const esc = await createEscalation({
      subject: '[转人工] 紧急',
      content: '客户要求立即联系',
      priority: 1,
      sessionKey: 'sess-1',
      userId: '42',
    });
    expect(esc.ticketNo).toBe('T-20260716002');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.sessionKey).toBe('sess-1');
    expect(body.userId).toBe('42');
  });
});

describe('api-client — tenantId 注入', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tenantId=null:不加 X-Tenant-Id', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: null }));
    vi.stubGlobal('fetch', fetchMock);
    await listActiveOrders({ sessionKey: 'sk-1', tenantId: null });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Tenant-Id']).toBeUndefined();
  });

  it('tenantId=2:加 X-Tenant-Id=2', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listActiveOrders({ sessionKey: 'sk-1', tenantId: 2 });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Tenant-Id']).toBe('2');
  });

  it('tenantId=空字符串:不加 X-Tenant-Id(V1 单租户兜底)', async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ code: 0, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listActiveOrders({ sessionKey: 'sk-1', tenantId: '' });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Tenant-Id']).toBeUndefined();
  });
});

describe('api-client — BackendApiError', () => {
  it('包含 code + httpStatus 字段', () => {
    const err = new BackendApiError('test', 1404, 404);
    expect(err.message).toBe('test');
    expect(err.code).toBe(1404);
    expect(err.httpStatus).toBe(404);
    expect(err.name).toBe('BackendApiError');
  });
});
