import { Module } from '@nestjs/common';
import { ClaudeLlmProvider } from './providers/claude-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';
import { LlmService } from './llm.service';

@Module({
  providers: [OpenAiLlmProvider, ClaudeLlmProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
