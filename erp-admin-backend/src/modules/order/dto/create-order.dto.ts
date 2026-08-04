import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  @Length(1, 50)
  productId!: string;

  @IsString()
  @Length(1, 200)
  productName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  productSku?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @Length(1, 50)
  customerName!: string;

  @IsString()
  @Length(1, 20)
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  @Length(1, 500)
  address!: string;

  @IsOptional()
  @IsIn(['wechat', 'alipay', 'bank'])
  payMethod?: 'wechat' | 'alipay' | 'bank';

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
