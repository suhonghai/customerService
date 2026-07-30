import request from './request';
import type { PageResult } from './session';

export interface AuditLogListItem {
  id: number;
  userId: number | null;
  username: string | null;
  module: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  method: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  status: number;
  errorMsg: string | null;
  costMs: number | null;
  createdAt: string;
}

export interface AuditLogDetail extends AuditLogListItem {
  params: unknown;
  oldValue: unknown;
  newValue: unknown;
}

export const auditLogApi = {
  list: (params: any) =>
    request.get<PageResult<AuditLogListItem>, PageResult<AuditLogListItem>>('/audit-logs', {
      params,
    }),
  getById: (id: number) => request.get<AuditLogDetail, AuditLogDetail>(`/audit-logs/${id}`),
};
