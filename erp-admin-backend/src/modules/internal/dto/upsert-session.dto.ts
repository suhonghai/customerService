import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /api/internal/cs/sessions — upsert 会话
 *
 * ai-cs-demo 在每次对话时调用:
 * - 同一 sessionKey 重复调用 = 累加 messageCount(只是计数,实际消息走 appendMessage)
 * - 首次调用 = 创建 session
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
}
