import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import request from '@/services/request';

/**
 * Ticket 数据 hooks — 把 list/stats/users 查询 + assign/status/reply mutation 集中
 *
 * 设计要点:
 *   - listQuery 接收 filters 对象(避免每个 queryKey 都手写依赖)
 *   - 三个 mutation 都自动 invalidate ['tickets'] 让列表 / 详情 / 统计同步刷新
 *   - 不在此处调 message / setXxx,由调用方决定副作用(便于测试 + 复用)
 */

export interface TicketListFilters {
  page: number;
  pageSize: number;
  status?: number;
  priority?: number;
  keyword?: string;
}

export function useTicketListQuery(filters: TicketListFilters) {
  return useQuery({
    queryKey: ['tickets', 'list', filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
      });
      if (filters.status !== undefined) params.set('status', String(filters.status));
      if (filters.priority !== undefined) params.set('priority', String(filters.priority));
      if (filters.keyword) params.set('keyword', filters.keyword);
      return request.get<any, any>(`/tickets?${params.toString()}`);
    },
  });
}

export function useTicketStatsQuery() {
  return useQuery({
    queryKey: ['tickets', 'stats'],
    queryFn: () => request.get<any, any>('/tickets/stats'),
  });
}

/**
 * 分配弹窗里"选择客服"用的用户列表,只在弹窗打开时拉
 */
export function useAssignableUsersQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'for-assign'],
    queryFn: () => request.get<any, any>('/users?page=1&pageSize=200'),
    enabled,
  });
}

/**
 * 单条工单详情 — 抽屉打开后增量拉 detail(logs / description 完整版)
 */
export function fetchTicketDetail(id: number | string) {
  return request.get<any, any>(`/tickets/${id}`);
}

interface AssignVars {
  id: number | string;
  assigneeId: number | string;
}
export function useAssignTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeId }: AssignVars) =>
      // cs-round-033:对齐后端 ticket.controller.ts:78 @Put(':id/assign') —
      // 之前用 post 会 404;同 useUpdateTicketStatus 用 put,保持 REST 惯例
      request.put(`/tickets/${id}/assign`, { assigneeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

interface StatusVars {
  id: number | string;
  status: number;
}
export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: StatusVars) => request.put(`/tickets/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

interface ReplyVars {
  id: number | string;
  content: string;
}
export function useReplyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: ReplyVars) => request.post(`/tickets/${id}/reply`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}
