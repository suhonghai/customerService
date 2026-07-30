import { PartialType } from '@nestjs/swagger';
import { CreateAiPromptTemplateDto } from './create-ai-prompt-template.dto';

export class UpdateAiPromptTemplateDto extends PartialType(
  CreateAiPromptTemplateDto,
) {}
