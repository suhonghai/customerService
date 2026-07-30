import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TicketTable, { type TicketListItem } from './TicketTable';
import { useAuthStore } from '@/stores/auth';

// Grid.useBreakpoint 在 jsdom 下 screens 默认空对象(isNarrow=true),列会隐藏。
// 这里用 mock 把 screens.md 设为 true,走 normal 路径,便于断言列头。
vi.mock('antd', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    Grid: { ...actual.Grid, useBreakpoint: () => ({ md: true }) },
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const rows: TicketListItem[] = [
  {
    id: 1,
    ticketNo: 'T-001',
    title: '登录失败',
    status: 0,
    priority: 2,
    assigneeName: 'Alice',
    creatorName: 'Bob',
    slaDeadline: '2026-07-15T10:00:00Z',
    createdAt: '2026-07-14T08:00:00Z',
  },
  {
    id: 2,
    ticketNo: 'T-002',
    title: '支付报错',
    status: 3,
    priority: 1,
    assigneeName: 'Carol',
    creatorName: 'Dave',
    slaDeadline: null,
    createdAt: '2026-07-13T08:00:00Z',
  },
];

const handlers = {
  onDetail: vi.fn(),
  onAssign: vi.fn(),
  onChangeStatus: vi.fn(),
  onReply: vi.fn(),
};

describe('TicketTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ userInfo: null });
  });

  // antd Table 在 jsdom 下首渲会做一轮列宽 / 排序图标测量,串行 25 文件并发跑时
  // 偶发超过默认 5s timeout。本组测试给 15s 兜底,断言意图不变。
  it('renders all expected column headers (wide screen)', { timeout: 15000 }, () => {
    render(
      wrap(
        <TicketTable
          rows={rows}
          loading={false}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
          handlers={handlers}
        />,
      ),
    );
    [
      '工单号',
      '标题',
      '状态',
      '优先级',
      '处理人',
      '创建人',
      'SLA 截止',
      '创建时间',
      '操作',
    ].forEach((h) => expect(screen.getAllByText(h).length).toBeGreaterThan(0));
  });

  it('renders each row with its ticket number and title', () => {
    render(
      wrap(
        <TicketTable
          rows={rows}
          loading={false}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
          handlers={handlers}
        />,
      ),
    );
    expect(screen.getAllByText('T-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('登录失败').length).toBeGreaterThan(0);
    expect(screen.getAllByText('T-002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('支付报错').length).toBeGreaterThan(0);
  });

  it('shows empty dash for missing slaDeadline', () => {
    render(
      wrap(
        <TicketTable
          rows={rows}
          loading={false}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
          handlers={handlers}
        />,
      ),
    );
    // antd renders '-' for null slaDeadline; check at least one cell has it
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('renders status and priority tags per row', () => {
    render(
      wrap(
        <TicketTable
          rows={rows}
          loading={false}
          page={1}
          pageSize={20}
          total={2}
          onPageChange={() => {}}
          handlers={handlers}
        />,
      ),
    );
    // 待处理 / 已解决 / 高 / 中 — 至少这些文案都要出现
    expect(screen.getAllByText('待处理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已解决').length).toBeGreaterThan(0);
    expect(screen.getAllByText('高').length).toBeGreaterThan(0);
    expect(screen.getAllByText('中').length).toBeGreaterThan(0);
  });
});
