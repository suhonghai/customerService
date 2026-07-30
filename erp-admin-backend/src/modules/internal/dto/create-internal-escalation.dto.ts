import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * POST /api/internal/cs/escalations — 内部创建转人工工单
 *
 * ai-cs-demo 触发转人工时调用,系统占位 creatorId=1(admin)。
 * 复用 cs_ticket 表,通过 category='escalation' + source=ai-cs-demo 标识。
 * 不新建表/不做 migration —— 与 create_ticket 走同一条 TicketsService.create 路径,
 * 仅 category 不同,便于运营在 admin 后台按 category 筛选。
 */
export class CreateInternalEscalationDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(5000)
  content!: string;

  /** 1 紧急 / 2 中 / 3 低,缺省 1(转人工默认高优) */
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;
}
