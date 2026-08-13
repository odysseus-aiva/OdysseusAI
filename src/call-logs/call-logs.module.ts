import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { PostCallAnalysisService } from './post-call-analysis.service';

@Module({
  imports: [LlmModule],
  controllers: [CallLogsController],
  providers: [CallLogsService, PostCallAnalysisService],
  exports: [CallLogsService, PostCallAnalysisService],
})
export class CallLogsModule {}
