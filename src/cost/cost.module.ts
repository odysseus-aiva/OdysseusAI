import { Module } from '@nestjs/common';
import { CostService } from './cost.service';

/**
 * Cost accounting is a leaf module with no dependencies — it only holds an
 * in-memory accumulator and a pricing table. Both VoiceAgentModule and
 * OrchestrationModule import it to record usage.
 */
@Module({
  providers: [CostService],
  exports: [CostService],
})
export class CostModule {}
