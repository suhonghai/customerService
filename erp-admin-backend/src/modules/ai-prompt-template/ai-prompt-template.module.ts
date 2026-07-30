import { Module } from '@nestjs/common';
import { AiPromptTemplateController } from './ai-prompt-template.controller';
import { AiPromptTemplateService } from './ai-prompt-template.service';

@Module({
  controllers: [AiPromptTemplateController],
  providers: [AiPromptTemplateService],
  exports: [AiPromptTemplateService],
})
export class AiPromptTemplateModule {}
