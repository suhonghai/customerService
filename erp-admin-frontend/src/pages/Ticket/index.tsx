import { useState } from 'react';
import { Grid } from 'antd';
import TicketFilters, { type TicketFiltersValue } from '@/components/ticket/TicketFilters';
import TicketTable, { type TicketListItem } from '@/components/ticket/TicketTable';
import TicketDetailDrawer from '@/components/ticket/TicketDetailDrawer';
import TicketStatsRow from '@/components/ticket/TicketStatsRow';
import TicketModals from '@/components/ticket/TicketModals';
import { useTicketListQuery, useTicketStatsQuery, fetchTicketDetail } from '@/hooks/use-tickets';
import type { TicketRow } from '@/components/ticket/TicketActions';

export default function TicketPage() {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;

  // 列表筛选 + 分页
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filters, setFilters] = useState<TicketFiltersValue>({
    keyword: '',
    status: undefined,
    priority: undefined,
  });

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<TicketListItem | null>(null);

  // 三个弹窗各自的目标 row
  const [assigning, setAssigning] = useState<TicketRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusEditing, setStatusEditing] = useState<TicketRow | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [replying, setReplying] = useState<TicketRow | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);

  // 数据查询
  const listQ = useTicketListQuery({
    page,
    pageSize,
    status: filters.status,
    priority: filters.priority,
    keyword: filters.keyword || undefined,
  });
  const statsQ = useTicketStatsQuery();

  // 详情:先放列表行,再异步拿完整 detail(含 description / logs)
  const handleDetail = async (row: TicketRow) => {
    setCurrent(row as TicketListItem);
    setDetailOpen(true);
    try {
      const detail = await fetchTicketDetail(row.id);
      setCurrent({ ...row, ...(detail as object) } as TicketListItem);
    } catch {
      // fallback:保留列表行的 snapshot,网络抖动常见
    }
  };

  // 筛选变化:重置回第 1 页
  const onFiltersChange = (next: TicketFiltersValue) => {
    setFilters(next);
    setPage(1);
  };

  const onSearch = (keyword: string) => {
    setFilters({ ...filters, keyword });
    setPage(1);
  };

  return (
    <div style={{ padding: isNarrow ? 12 : 24 }}>
      <TicketStatsRow stats={statsQ.data || {}} isNarrow={isNarrow} />

      <TicketFilters
        value={filters}
        isNarrow={isNarrow}
        onChange={onFiltersChange}
        onSearch={onSearch}
      />

      <TicketTable
        rows={(listQ.data?.list || []) as TicketListItem[]}
        loading={listQ.isLoading}
        page={page}
        pageSize={pageSize}
        total={listQ.data?.total || 0}
        onPageChange={setPage}
        handlers={{
          onDetail: handleDetail,
          onAssign: (r) => {
            setAssigning(r);
            setAssignOpen(true);
          },
          onChangeStatus: (r) => {
            setStatusEditing(r);
            setStatusModalOpen(true);
          },
          onReply: (r) => {
            setReplying(r);
            setReplyOpen(true);
          },
        }}
      />

      <TicketDetailDrawer open={detailOpen} ticket={current} onClose={() => setDetailOpen(false)} />

      <TicketModals
        assigning={assigning}
        assignOpen={assignOpen}
        onAssignClose={() => setAssignOpen(false)}
        statusEditing={statusEditing}
        statusModalOpen={statusModalOpen}
        onStatusModalClose={() => setStatusModalOpen(false)}
        replying={replying}
        replyOpen={replyOpen}
        onReplyClose={() => setReplyOpen(false)}
      />
    </div>
  );
}
