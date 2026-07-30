import { IsOptional, IsString, Length } from 'class-validator';

/**
 * PUT /api/orders/:id — 只允许修改地址 + 备注
 * 其它字段(金额/客户/状态/支付)走专门接口
 */
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}