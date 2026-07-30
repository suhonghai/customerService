import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * 测试 AI 配置 DTO
 * - prompt: 测试提示词(必填)
 * - systemPrompt: 临时覆盖 system prompt(可选,不传走配置里的)
 */
export class TestAiConfigDto {
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;
}
