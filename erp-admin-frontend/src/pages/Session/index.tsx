import { useState } from 'react';
import { message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionApi } from '@/services/session';
import { SessionFilters, toListParams } from '@/components/session/SessionFilters';
import type { SessionFiltersValue } from '@/components/session/session-constants';
import { SessionTable } from '@/components/session/SessionTable';
import { SessionDetailDrawer } from '@/components/session/SessionDetailDrawer';

const NO_FILTERS: SessionFiltersValue = {
  status: undefined,
  dateRange: null,
  hasRating: undefined,
};

export default function SessionPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<SessionFiltersValue>(NO_FILTERS);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', page, pageSize, filters],
    queryFn: () => sessionApi.list(toListParams(filters, page, pageSize)),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => sessionApi.remove(id),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <SessionFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onReset={() => {
          setFilters(NO_FILTERS);
          setPage(1);
        }}
      />
      <SessionTable
        data={data?.list || []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total || 0}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        onDetail={(s) => setDrawerId(s.id)}
        onDelete={(id) => removeMut.mutate(id)}
      />
      <SessionDetailDrawer
        open={drawerId != null}
        sessionId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}
