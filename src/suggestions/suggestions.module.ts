import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AgentSuggestionEntity,
  AgentSuggestionSchema,
} from '../persistence/mongo/schemas/agent-suggestion.schema';
import { LlmModule } from '../llm/llm.module';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentSuggestionEntity.name, schema: AgentSuggestionSchema },
    ]),
    LlmModule,
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
