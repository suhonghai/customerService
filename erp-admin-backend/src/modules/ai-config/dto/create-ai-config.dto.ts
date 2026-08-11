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

/**
 * Provider 枚举
 * - dashscope: 阿里云百炼(OpenAI 兼容)
 * - openai: OpenAI 官方
 * - minimax: 国内 MiniMax(OpenAI 兼容)
 */
export type AiProvider = 'dashscope' | 'openai' | 'minimax';

export const AI_PROVIDERS: readonly AiProvider[] = ['dashscope', 'openai', 'minimax'];

export class CreateAiConfigDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsOptional()
  code?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsIn(AI_PROVIDERS as unknown as string[], {
    message: 'provider 必须是 dashscope / openai / minimax 之一',
  })
  provider!: AiProvider;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelId!: string;

  /**
   * 向量模型名(可选)— EmbeddingService 优先读 DB 此字段,
   * 为空 fallback env EMBED_MODEL,再 fallback DEFAULT_MODEL(text-embedding-v4)。
   * 同 provider 的 apiKey/baseUrl 通常可与 chat 共享;embedding 必须按类目配。
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  embedModel?: string;

  /**
   * API key(明文,service 端加密入库;接口返回时脱敏)
   * 必填
   */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number = 0.7;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number = 0.8;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32000)
  maxTokens?: number = 2000;

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
  isDefault?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number = 1;
}
