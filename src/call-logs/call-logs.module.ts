import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RecordingModule } from '../recording/recording.module';
import { AnalyticsService } from './analytics.service';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { PostCallAnalysisService } from './post-call-analysis.service';

@Module({
  imports: [LlmModule, RecordingModule],
  controllers: [CallLogsController],
  providers: [AnalyticsService, CallLogsService, PostCallAnalysisService],
  exports: [AnalyticsService, CallLogsService, PostCallAnalysisService],
})
export class CallLogsModule {}
