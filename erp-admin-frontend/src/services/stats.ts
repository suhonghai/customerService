import request from './request';

export interface StatsOverview {
  sessionToday: number;
  sessionTrend: { date: string; count: number }[];
  ticketPending: number;
  ticketProcessing: number;
  aiHitRate: number;
  avgResponseSeconds: number;
  avgRating: number;
}

export interface AgentPerformanceRow {
  agentId: number;
  agentName: string;
  ticketCount: number;
  avgResolveMinutes: number;
  ratingAvg: number;
}

export interface AiHitRateRow {
  modelCode: string;
  modelName: string;
  totalSessions: number;
  escalatedSessions: number;
  hitRate: number;
}

export const statsApi = {
  overview: () => request.get<StatsOverview, StatsOverview>('/stats/overview'),
  agentPerformance: (params: any) =>
    request.get<AgentPerformanceRow[], AgentPerformanceRow[]>('/stats/agent-performance', {
      params,
    }),
  aiHitRate: (params: any) =>
    request.get<AiHitRateRow[], AiHitRateRow[]>('/stats/ai-hit-rate', {
      params,
    }),
};
