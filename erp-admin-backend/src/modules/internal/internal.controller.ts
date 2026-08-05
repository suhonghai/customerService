import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InternalGuard } from '../../common/guards/internal.guard';
import { InternalService } from './internal.service';
import { UpsertSessionDto } from './dto/upsert-session.dto';
import { AppendMessageDto } from './dto/append-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { CreateInternalTicketDto } from './dto/create-internal-ticket.dto';
import { CreateInternalEscalationDto } from './dto/create-internal-escalation.dto';
import { AppendMessageViaTicketDto } from './dto/append-message-via-ticket.dto';

@ApiTags('Internal(内部 API)')
@ApiBearerAuth('internal-token')
@UseGuards(InternalGuard)
@Controller('internal/cs')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(private readonly internalService: InternalService) {}

  /**
   * GET /api/internal/cs/ai-config/active
   *   返默认 AI 配置 + **明文 apiKey**
   *   仅供同机服务(ai-cs-demo)调用,IP 必须是 127.0.0.1/::1
   */
  @Get('ai-config/active')
  // TODO(throttle):internal 端点虽有 IP 白名单 + token 双因子,但对外暴露需限流(issue #25)。
  @ApiOperation({ summary: '取默认 AI 配置(明文 key,供 ai-cs-demo)' })
  async getActiveAiConfig() {
    return this.internalService.getActiveAiConfig();
  }

  /**
   * GET /api/internal/cs/faq/search?q=...&topK=3
   *   FAQ 语义检索,只返 published
   */
  @Get('faq/search')
  // TODO(throttle):internal FAQ 检索需限流,issue #25。
  @ApiOperation({ summary: 'FAQ 语义检索(只查 published)' })
  async searchFaq(@Query('q') q: string, @Query('topK') topK?: string) {
    const k = topK ? parseInt(topK, 10) : 3;
    return this.internalService.searchFaq(q ?? '', isNaN(k) ? 3 : k);
  }

  /**
   * GET /api/internal/cs/sessions?visitorId=...&userId=...&limit=...
   *   列出会话(按 visitorId / userId 过滤),用于 ai-cs-demo 刷新恢复
   *   同时匹配 visitorId + userId(登录用户 userId 更新时仍能命中)
   */
  @Get('sessions')
  @ApiOperation({ summary: '列出会话(按 visitorId / userId 过滤,refresh 恢复用)' })
  async listSessions(
    @Query('visitorId') visitorId: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    sessions: Array<{
      sessionKey: string;
      title: string | null;
      visitorId: string;
      userId: number | null;
      messageCount: number;
      updatedAt: string;
      startedAt: string;
    }>;
  }> {
    const lim = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 200);
    return {
      sessions: await this.internalService.listSessions({
        visitorId,
        userId: userId ? Number(userId) : undefined,
        limit: lim,
      }),
    };
  }

  /**
   * POST /api/internal/cs/sessions
   *   upsert 会话(按 sessionKey)
   */
  @Post('sessions')
  // TODO(throttle):internal session upsert 需限流,issue #25。
  @ApiOperation({ summary: 'upsert 会话(按 sessionKey)' })
  async upsertSession(@Body() dto: UpsertSessionDto) {
    return this.internalService.upsertSession(dto);
  }

  /**
   * POST /api/internal/cs/sessions/:id/messages
   *   追加消息
   */
  @Post('sessions/:id/messages')
  // TODO(throttle):internal append message 需限流,issue #25。
  @ApiOperation({ summary: '追加消息(role=user/assistant/system/tool)' })
  async appendMessage(@Param('id', ParseIntPipe) id: number, @Body() dto: AppendMessageDto) {
    return this.internalService.appendMessage(id, dto);
  }

  /**
   * GET /api/internal/cs/sessions/:id/messages
   *   拉会话所有 messages(按 id ASC),用于 ai-cs-demo 刷新恢复
   */
  @Get('sessions/:id/messages')
  @ApiOperation({ summary: '拉会话所有 messages(刷新恢复用)' })
  async getMessages(@Param('id', ParseIntPipe) id: number) {
    return this.internalService.getMessages(id);
  }

  /**
   * PATCH /api/internal/cs/sessions/:id/messages/:msgId
   *   增量更新 message(流式期间节流调用)
   *   body: { content?, parts?, metadata?, status? }
   */
  @Patch('sessions/:id/messages/:msgId')
  @ApiOperation({ summary: '增量更新 message(流式持久化)' })
  async updateMessage(
    @Param('id', ParseIntPipe) id: number,
    @Param('msgId', ParseIntPipe) msgId: number,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.internalService.updateMessage(id, msgId, dto);
  }

  /**
   * cs-round-011:GET /api/internal/cs/sessions/:id/messages/:msgId — 拉单条消息
   *   续推接口需要:continueFromMessageId 路径下,服务端先 getMessage 拿到
   *   已有 partial content + parts,把续推起点对齐。
   *   404 → status=4xx 业务错误,客户端 catch 后降级。
   */
  @Get('sessions/:id/messages/:msgId')
  @ApiOperation({ summary: '拉单条 message(cs-round-011 续推接口需要)' })
  async getMessage(
    @Param('id', ParseIntPipe) id: number,
    @Param('msgId', ParseIntPipe) msgId: number,
  ) {
    return this.internalService.getMessage(id, msgId);
  }

  /**
   * GET /api/internal/cs/orders?sessionKey=X[&status=Y]
   *   W11 C-FULL:服务端从 sessionKey 反查 cs_session.userId,再查 Order。
   *   不接受 userId query 参数(防止 IDOR);即使客户端误传,也会被忽略并 warn。
   */
  @Get('orders')
  @ApiOperation({ summary: '服务端反查 sessionKey → 用户的进行中订单' })
  async listOrders(
    @Query('sessionKey') sessionKey: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string, // 接住但忽略,防御性
  ) {
    if (userId !== undefined) {
      this.logger.warn(`listOrders 收到 userId=${userId} 但被忽略`);
    }
    return this.internalService.listOrdersBySession({ sessionKey, status });
  }

  /**
   * GET /api/internal/cs/orders/:orderNo
   *   查订单(by orderNo)+ items
   */
  @Get('orders/:orderNo')
  @ApiOperation({ summary: '按 orderNo 查订单(含 items)' })
  async findOrderByNo(@Param('orderNo') orderNo: string) {
    return this.internalService.findOrderByNo(orderNo);
  }

  /**
   * POST /api/internal/cs/tickets
   *   创建工单(系统占位 creatorId=1,自动 ticketNo + SLA)
   */
  @Post('tickets')
  // TODO(throttle):internal create ticket 需限流,issue #25。
  @ApiOperation({ summary: '创建工单(转人工,系统占位 creator)' })
  async createTicket(@Body() dto: CreateInternalTicketDto) {
    return this.internalService.createTicket(dto);
  }

  /**
   * POST /api/internal/cs/escalations
   *   转人工专用工单(ai-cs-demo 调用)
   *   与 /tickets 共用 cs_ticket 表,category='escalation' + 默认 priority=1(紧急)
   *   运营可在后台按 category 筛选所有转人工来源的工单
   */
  @Post('escalations')
  // TODO(throttle):internal create escalation 需限流,issue #25。
  @ApiOperation({ summary: '转人工专用工单(系统占位 creator,默认高优)' })
  async createEscalation(@Body() dto: CreateInternalEscalationDto) {
    return this.internalService.createEscalation(dto);
  }

  /**
   * GET /api/internal/cs/sessions/:id/open-ticket
   *   取会话当前 OPEN (status ∈ {1,2,3}) 的工单(用于 ai-cs-demo 检测转人工后闭嘴)
   *   无 open ticket → 返 null
   */
  @Get('sessions/:id/open-ticket')
  @ApiOperation({ summary: '取会话当前 OPEN 工单(转人工检测)' })
  async getSessionOpenTicket(@Param('id', ParseIntPipe) id: number) {
    return this.internalService.getSessionOpenTicket(id);
  }

  /**
   * GET /api/internal/cs/sessions/:id/session-info
   *   取会话关键字段(供 erp-admin ConversationPanel 用 sessionKey 走 WS auth)
   *   极小只读,select 限定避免泄漏
   */
  @Get('sessions/:id/session-info')
  @ApiOperation({ summary: '取会话关键字段(供 erp-admin WS auth)' })
  async getSessionInfo(@Param('id', ParseIntPipe) id: number) {
    return this.internalService.getSessionInfo(id);
  }

  /**
   * POST /api/internal/cs/tickets/:id/messages
   *   运营在 erp-admin 工单详情输入框 → 内部转写到 ticket.service.reply()
   *   内部仍走原有 cs_message bridge + operator_reply emit
   */
  @Post('tickets/:id/messages')
  // TODO(throttle):internal append operator message 需限流,issue #25。
  @ApiOperation({ summary: '运营通过 ticket 路由发消息(转 reply())' })
  async appendOperatorMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AppendMessageViaTicketDto,
  ) {
    return this.internalService.appendOperatorMessageViaTicket(id, dto);
  }

  /**
   * DELETE /api/internal/cs/sessions/:id
   *   软删会话(csSession.deletedAt = now())
   *   listSessions 已带 deletedAt: null 过滤,软删后自动从恢复列表消失
   */
  @Delete('sessions/:id')
  @ApiOperation({ summary: '软删会话(csSession.deletedAt = now())' })
  async deleteSession(@Param('id') id: string) {
    return this.internalService.deleteSession(+id);
  }

  /**
   * cs-round-002:触发 reaper 收敛 stale streaming placeholder
   *   业务:assistant message 创建时 status=2 streaming;若流被中断(onFinish/onAbort
   *   未触发),这条 row 永远停 status=2。前端 refetch 当 interrupted 渲染 → 触发
   *   auto-retry,白白消耗 LLM 配额。修法:reaper 兜底,扫陈旧 status=2 改成 4 (error)。
   *   触发:被动在每次 upsertSession 后 fire-and-forget,或主动调这个 endpoint。
   *   阈值:5 分钟(远大于 maxDuration=60s,不会误杀正在生成的流)。
   */
  @Post('reap-orphans')
  // TODO(throttle):reapOrphans 是定时任务也可由前端触发,需限流,issue #25。
  @ApiOperation({ summary: '收敛 stale streaming placeholder(status=2 → status=4)' })
  async reapOrphans() {
    return this.internalService.reapStaleStreaming();
  }

  /**
   * cs-round-005:按 sessionKey 软删(no-op 友好)
   *   旧流程副作用:sessionKey 不存在 → create 空 session 再 delete,留 deletedAt 痕迹
   *   新流程:先 findUnique by key,命中才软删;不存在 → 返 { deleted: false } 不报错
   */
  @Delete('sessions/by-key/:sessionKey')
  @ApiOperation({ summary: '按 sessionKey 软删(不存在 → no-op)' })
  async deleteSessionByKey(@Param('sessionKey') sessionKey: string) {
    return this.internalService.deleteSessionByKey(sessionKey);
  }
}
