import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogApi, type AuditLogListItem } from '@/services/audit-log';
import {
  AuditLogFilters,
  toListParams,
  EMPTY_FILTERS,
  type AuditLogFiltersValue,
} from '@/components/audit-log/AuditLogFilters';
import { AuditLogTable } from '@/components/audit-log/AuditLogTable';
import { AuditLogDetailDrawer } from '@/components/audit-log/AuditLogDetailDrawer';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<AuditLogFiltersValue>(EMPTY_FILTERS);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const params = toListParams(filters, page, pageSize);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, pageSize, filters],
    queryFn: () => auditLogApi.list(params),
  });

  const detailQ = useQuery({
    queryKey: ['audit-log', drawerId],
    queryFn: () => auditLogApi.getById(drawerId!),
    enabled: drawerId != null,
  });

  const onFiltersChange = (next: AuditLogFiltersValue) => {
    setFilters(next);
    setPage(1);
  };

  const onReset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const onDetail = (row: AuditLogListItem) => setDrawerId(row.id);

  return (
    <div>
      <AuditLogFilters value={filters} onChange={onFiltersChange} onReset={onReset} />
      <AuditLogTable
        data={data?.list || []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total || 0}
        onPageChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        onDetail={onDetail}
      />
      <AuditLogDetailDrawer
        open={drawerId != null}
        drawerId={drawerId}
        log={detailQ.data}
        loading={detailQ.isLoading}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}
