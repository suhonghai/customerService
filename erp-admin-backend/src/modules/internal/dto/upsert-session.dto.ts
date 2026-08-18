import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /api/internal/cs/sessions — upsert 会话
 *
 * ai-cs-demo 在每次对话时调用:
 * - 同一 sessionKey 重复调用 = 累加 messageCount(只是计数,实际消息走 appendMessage)
 * - 首次调用 = 创建 session
 *
 * cs-round-056:首条 user msg 同步落库 — 防止「点发送 + 立即刷新」产生孤儿空会话
 *   (session row 已有但 cs_message 0 条,/history 返回空数组 → welcome 页)。
 *   firstUserMessage + firstUserMessageParts 在同一 Prisma $transaction 内写入
 *   cs_message(role='user', status=1)。ai-cs /api/chat 看到 firstUserMessage 字段
 *   时跳过自己的 appendMessage(user),避免重复。
 */
export class UpsertSessionDto {
  @IsString()
  @MaxLength(100)
  sessionKey!: string;

  @IsString()
  @MaxLength(100)
  visitorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  visitorName?: string;

  /** 1 Web / 2 微信 / 3 App,缺省 1 */
  @IsOptional()
  @IsInt()
  @Min(1)
  channel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  aiModelCode?: string;

  /** V1 S5:已登录的内部员工 userId(落到 cs_session.userId);W11 C-FULL 必需 — 反查用 */
  @IsOptional()
  @IsInt()
  userId?: number;

  /** W11:C 端 CsCustomer.id(和 userId 互斥;C 端登录时填这个,不要填 userId)。
   *  落到 cs_session.customerId,listOrdersBySession 优先看 customerId 过滤 Order.customer_id。 */
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  /** cs-round-056:首条 user msg 文本。新会话建立时若传此字段,会在同一事务内写入
   *  cs_message(role='user', status=1),防「点发送立即刷新」孤儿空会话。
   *  @db.Text 存长文本,前端截 30 字做 title。 */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  firstUserMessage?: string;

  /** cs-round-056:首条 user msg 的 AI SDK UI Message parts(透传给 cs_message.parts)。
   *  形状:Array<{type:'text', text:string}> 等。AI SDK 6.x 结构,不强 schema 校验。 */
  @IsOptional()
  firstUserMessageParts?: unknown;

  /** cs-round-059:BFF upsert 同时创建 assistant placeholder(status=2, content='')?
   *  默认 false,保持向后兼容;ai-cs-demo 新建会话时传 true。
   *  修法背景:client 在 chat route 写 assistant 之前 cancel(点发送 + 立即刷新)
   *  → DB 只有 user msg,assistant 永远缺失。修法:BFF upsert 事务内一并写
   *  assistant placeholder,client cancel 时 DB 仍有完整 user + placeholder →
   *  /history 返回 2 条 → resume 触发续推。 */
  @IsOptional()
  @IsBoolean()
  createAssistantPlaceholder?: boolean;
}
