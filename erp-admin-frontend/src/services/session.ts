import request from './request';

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionListItem {
  id: number;
  sessionKey: string;
  visitorId: string;
  visitorName: string | null;
  channel: number;
  channelLabel: string;
  status: number;
  statusLabel: string;
  aiModelCode: string | null;
  messageCount: number;
  rating: number | null;
  ratingText: string | null;
  escalatedAt: string | null;
  endedAt: string | null;
  startedAt: string;
  updatedAt: string;
  user?: {
    id: number;
    username: string;
    nickname: string | null;
    departmentId: number | null;
  } | null;
  messageCount_detail?: number;
  preview?: string | null;
  previewAt?: string | null;
}

export interface SessionMessage {
  id: number;
  sessionId?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export const sessionApi = {
  list: (params: any) =>
    request.get<PageResult<SessionListItem>, PageResult<SessionListItem>>('/sessions', { params }),
  getById: (id: number) => request.get<SessionListItem, SessionListItem>(`/sessions/${id}`),
  getMessages: (id: number, params?: any) =>
    request.get<PageResult<SessionMessage>, PageResult<SessionMessage>>(
      `/sessions/${id}/messages`,
      { params },
    ),
  remove: (id: number) => request.delete(`/sessions/${id}`),
};
