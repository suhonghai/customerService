import { Injectable, Logger } from '@nestjs/common';
import dayjs = require('dayjs');
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAgentPerformanceDto } from './dto/query-agent-performance.dto';
import { QueryAiHitRateDto } from './dto/query-ai-hit-rate.dto';

/**
 * StatsService(Day 8)
 *
 * 接口:
 * - GET /api/stats/overview            总览(7 个数字 + 7 天趋势)
 * - GET /api/stats/agent-performance   客服绩效(按时间范围 / agent)
 * - GET /api/stats/ai-hit-rate         AI 命中率(按模型)
 *
 * 看板是**全局数据**,**不应用 DataScope**(全公司视角)
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // GET /api/stats/overview — 总览
  //   - sessionToday       今日会话数
  //   - sessionTrend       最近 7 天每天会话数 [{date: 'MM-DD', count}]
  //   - ticketPending      待领取工单数
  //   - ticketProcessing   处理中工单数
  //   - aiHitRate          AI 命中率(已结束会话中未转人工的比例)
  //   - avgResponseSeconds 平均响应秒数(简化,真实应从消息时间差算)
  //   - avgRating          平均评分
  // ============================================================
  async overview() {
    const today = dayjs().startOf('day').toDate();

    // 1. 今日会话数
    const sessionToday = await this.prisma.csSession.count({
      where: { startedAt: { gte: today } },
    });

    // 2. 工单:待领取 / 处理中
    const [ticketPending, ticketProcessing] = await Promise.all([
      this.prisma.csTicket.count({ where: { status: 1, deletedAt: null } }),
      this.prisma.csTicket.count({ where: { status: 2, deletedAt: null } }),
    ]);

    // 3. AI 命中率 = (已结束会话 - 已转人工) / 已结束会话
    const [totalEnded, escalatedEnded] = await Promise.all([
      this.prisma.csSession.count({ where: { status: 2 } }),
      this.prisma.csSession.count({
        where: { status: 2, escalatedAt: { not: null } },
      }),
    ]);
    const aiHitRate =
      totalEnded > 0
        ? Number(((totalEnded - escalatedEnded) / totalEnded).toFixed(3))
        : 0;

    // 4. 平均评分(取最近 100 条已评分的会话)
    const ratedSessions = await this.prisma.csSession.findMany({
      where: { rating: { not: null } },
      select: { rating: true },
      take: 100,
    });
    const avgRating =
      ratedSessions.length > 0
        ? Number(
            (
              ratedSessions.reduce((s, x) => s + (x.rating ?? 0), 0) /
              ratedSessions.length
            ).toFixed(2),
          )
        : 0;

    // 5. 7 天趋势
    const sessionTrend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = dayjs().subtract(i, 'day');
      const count = await this.prisma.csSession.count({
        where: {
          startedAt: {
            gte: day.startOf('day').toDate(),
            lt: day.endOf('day').toDate(),
          },
        },
      });
      sessionTrend.push({ date: day.format('MM-DD'), count });
    }

    // 6. avgResponseSeconds(Day 9 修):实算最近 100 条已结束会话
    //   算法:对每个 session 的消息按时间排序,取相邻 (user, assistant) 配对,
    //        assistant.createdAt - user.createdAt,所有差累加除以配对数
    //   没有配对则跳过(没人机对话不算响应时长)
    const recentEnded = await this.prisma.csSession.findMany({
      where: { status: 2, endedAt: { not: null }, deletedAt: null },
      orderBy: { endedAt: 'desc' },
      take: 100,
      select: { id: true },
    });

    let totalResponseMs = 0;
    let pairCount = 0;
    if (recentEnded.length > 0) {
      const sessionIds = recentEnded.map((s) => s.id);
      const allMessages = await this.prisma.csMessage.findMany({
        where: { sessionId: { in: sessionIds }, role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'asc' },
        select: { sessionId: true, role: true, createdAt: true },
      });
      // 按 sessionId 分组
      const bySession = new Map<number, Array<{ role: string; createdAt: Date }>>();
      for (const m of allMessages) {
        if (!bySession.has(m.sessionId)) bySession.set(m.sessionId, []);
        bySession.get(m.sessionId)!.push({ role: m.role, createdAt: m.createdAt });
      }
      for (const msgs of bySession.values()) {
        for (let i = 0; i < msgs.length - 1; i++) {
          if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
            totalResponseMs +=
              msgs[i + 1].createdAt.getTime() - msgs[i].createdAt.getTime();
            pairCount++;
          }
        }
      }
    }
    const avgResponseSeconds =
      pairCount > 0
        ? Math.round((totalResponseMs / pairCount / 1000) * 10) / 10
        : 0;

    return {
      sessionToday,
      sessionTrend,
      ticketPending,
      ticketProcessing,
      aiHitRate,
      avgResponseSeconds,
      avgRating,
    };
  }

  // ============================================================
  // GET /api/stats/agent-performance — 客服绩效
  //   每人:{agentId, agentName, ticketCount, avgResolveMinutes, ratingAvg}
  // ============================================================
  async agentPerformance(query: QueryAgentPerformanceDto) {
    const start = query.startDate ? new Date(query.startDate) : dayjs().subtract(30, 'day').startOf('day').toDate();
    const end = query.endDate ? new Date(query.endDate) : new Date();

    // 找所有角色 code in ['agent', 'agent_lead'] 的用户(可指定 agentId)
    const agents = await this.prisma.user.findMany({
      where: {
        ...(query.agentId ? { id: query.agentId } : {}),
        deletedAt: null,
        status: 1,
        roles: {
          some: { role: { code: { in: ['agent', 'agent_lead'] } } },
        },
      },
      take: 50,
      select: { id: true, username: true, nickname: true },
    });

    const results: {
      agentId: number;
      agentName: string;
      ticketCount: number;
      avgResolveMinutes: number;
      ratingAvg: number;
    }[] = [];
    for (const agent of agents) {
      // 工单统计
      const tickets = await this.prisma.csTicket.findMany({
        where: {
          assigneeId: agent.id,
          createdAt: { gte: start, lte: end },
          deletedAt: null,
        },
        select: { id: true, createdAt: true, resolvedAt: true, status: true },
      });
      const resolved = tickets.filter(
        (t) => t.resolvedAt != null,
      ) as Array<{
        id: number;
        createdAt: Date;
        resolvedAt: Date;
        status: number;
      }>;
      const avgResolveMinutes =
        resolved.length > 0
          ? Math.round(
              resolved.reduce(
                (s, t) => s + (t.resolvedAt.getTime() - t.createdAt.getTime()),
                0,
              ) /
                resolved.length /
                60000,
            )
          : 0;

      // 评分(从关联会话)
      const sessions = await this.prisma.csSession.findMany({
        where: { userId: agent.id, rating: { not: null } },
        select: { rating: true },
      });
      const ratingAvg =
        sessions.length > 0
          ? Number(
              (
                sessions.reduce((s, x) => s + (x.rating ?? 0), 0) /
                sessions.length
              ).toFixed(2),
            )
          : 0;

      results.push({
        agentId: agent.id,
        agentName: agent.nickname || agent.username,
        ticketCount: tickets.length,
        avgResolveMinutes,
        ratingAvg,
      });
    }

    return results;
  }

  // ============================================================
  // GET /api/stats/ai-hit-rate — AI 命中率(按模型)
  //   每个 model:{modelCode, modelName, totalSessions, escalatedSessions, hitRate}
  // ============================================================
  async aiHitRate(query: QueryAiHitRateDto) {
    const start = query.startDate ? new Date(query.startDate) : dayjs().subtract(30, 'day').startOf('day').toDate();
    const end = query.endDate ? new Date(query.endDate) : new Date();

    const models = await this.prisma.aiModelConfig.findMany({
      where: { status: 1 },
      select: { code: true, name: true },
    });

    const results: {
      modelCode: string;
      modelName: string;
      totalSessions: number;
      escalatedSessions: number;
      hitRate: number;
    }[] = [];
    for (const m of models) {
      const [total, escalated] = await Promise.all([
        this.prisma.csSession.count({
          where: {
            aiModelCode: m.code,
            startedAt: { gte: start, lte: end },
          },
        }),
        this.prisma.csSession.count({
          where: {
            aiModelCode: m.code,
            startedAt: { gte: start, lte: end },
            escalatedAt: { not: null },
          },
        }),
      ]);
      results.push({
        modelCode: m.code,
        modelName: m.name,
        totalSessions: total,
        escalatedSessions: escalated,
        hitRate:
          total > 0 ? Number(((total - escalated) / total).toFixed(3)) : 0,
      });
    }

    return results;
  }
}
