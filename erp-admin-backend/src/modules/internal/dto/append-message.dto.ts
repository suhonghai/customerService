import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * POST /api/internal/cs/sessions/:id/messages — 追加消息
 *
 * role: user / assistant / system / tool
 * content: 消息文本(可空,例如 tool 消息 parts 占位)
 * parts: AI SDK UI Message parts(assistant 流式累积用,opaque 结构,不强 schema 校验)
 * metadata: 任意 JSON(工具调用结果、错误信息等)
 */
export class AppendMessageDto {
  @IsIn(['user', 'assistant', 'system', 'tool'])
  role!: 'user' | 'assistant' | 'system' | 'tool';

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  parts?: unknown;

  @IsOptional()
  metadata?: unknown;

  @IsOptional()
  @IsInt()
  status?: number;
}
