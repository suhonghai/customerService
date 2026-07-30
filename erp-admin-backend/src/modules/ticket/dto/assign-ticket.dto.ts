import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * PUT /api/tickets/:id/assign — 分配工单
 *
 * - assigneeId:被分配的用户 id(客服坐席)
 *
 * 服务端会校验 assigneeId 存在 + 自动把 status 改为 2 处理中
 */
export class AssignTicketDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;
}
