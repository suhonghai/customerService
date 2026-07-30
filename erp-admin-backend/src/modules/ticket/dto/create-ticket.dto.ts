import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POST /api/tickets — 创建工单
 *
 * - title / content 必填
 * - priority 1 高 / 2 中(默认) / 3 低
 * - category 业务分类(退款 / 物流 / 优惠 / 会员 / 其他)
 * - relatedOrderId 可选:关联的订单
 * - sessionId 可选:关联的会话
 */
export class CreateTicketDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 5000)
  content!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  @Min(1)
  priority?: 1 | 2 | 3;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  relatedOrderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sessionId?: number;
}
