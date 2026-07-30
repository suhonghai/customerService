import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/**
 * POST /api/internal/cs/tickets/:id/messages
 * 运营在 erp-admin 工单详情输入框 → 内部 API 转写为 ticket.service.reply()。
 * content: 1-5000 字
 * internal: 内部备注(默认 false)
 */
export class AppendMessageViaTicketDto {
  @IsString()
  @Length(1, 5000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
