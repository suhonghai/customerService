import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsIn,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AI_PROVIDERS, AiProvider } from './create-ai-config.dto';

/**
 * 更新 AI 配置 DTO
 * - 全部字段可选
 * - apiKey 若传,会重加密入库;不传则保留原值
 */
export class UpdateAiConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(AI_PROVIDERS as unknown as string[])
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelId?: string;

  /**
   * 向量模型名(可选)— 显式传 null 不允许(只可"省略不改"或"改成具体值")。
   * 后台 UI 加 input + 用 defaultValue 保留原值即可。
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  embedModel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32000)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number;
}
