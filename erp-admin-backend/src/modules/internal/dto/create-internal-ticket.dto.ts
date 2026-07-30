import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * POST /api/internal/cs/tickets — 内部创建工单
 *
 * ai-cs-demo 触发转人工时调用,系统占位 creatorId=1(admin)
 */
export class CreateInternalTicketDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  content!: string;

  /** 1 紧急 / 2 中 / 3 低,缺省 2 */
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsInt()
  sessionId?: number;

  @IsOptional()
  @IsInt()
  relatedOrderId?: number;
}
