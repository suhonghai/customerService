import { IsString, Length } from 'class-validator';

/**
 * POST /api/tickets/:id/reply — 回复工单(只记 log,不改 status)
 */
export class ReplyTicketDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
