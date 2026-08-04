import { IsString, IsOptional, IsInt, MinLength, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAiPromptTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  /**
   * 变量名 JSON 数组(字符串)
   * 例: '["store_name", "ticket_no"]'
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  variables?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number = 1;
}
