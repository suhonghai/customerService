import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

/**
 * PUT /api/tickets/:id/status — 改工单状态(状态机)
 *
 * newStatus 取值:
 * - 1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭
 *
 * 合法转换见 TicketService.STATE_TRANSITIONS
 */
export class UpdateTicketStatusDto {
  @IsInt()
  @IsIn([1, 2, 3, 4])
  newStatus!: 1 | 2 | 3 | 4;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  comment?: string;
}
