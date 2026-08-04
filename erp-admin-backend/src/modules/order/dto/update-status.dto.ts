import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

/**
 * PUT /api/orders/:id/status — 改订单状态(带状态机)
 *
 * newStatus 取值:
 * - 1 待发货 → 2 已发货(需 shipNo + shipCompany)
 * - 1 待发货 → 5 已取消
 * - 2 已发货 → 3 已收货
 * - 2 已发货 → 5 已取消
 * - 3 已收货 → 4 已完成
 */
export class UpdateOrderStatusDto {
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  newStatus!: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  shipNo?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  shipCompany?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
