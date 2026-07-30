import { IsNumber, IsString, Length, Min } from 'class-validator';

/**
 * POST /api/orders/:id/refund — 退款
 *
 * - refundAmount:本次退款金额(元)
 * - reason:退款原因(必填)
 *
 * 业务规则:
 * - 订单 payStatus 必须为 2(已支付)/ 3(已退款)/ 4(部分退款)
 * - refundAmount <= order.payAmount - 已退金额
 * - 全退 → payStatus=3;部分退 → payStatus=4
 */
export class RefundOrderDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  refundAmount!: number;

  @IsString()
  @Length(1, 200)
  reason!: string;
}