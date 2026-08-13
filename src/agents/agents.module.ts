import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentToolResolverService } from './agent-tool-resolver.service';
import { AgentSeederService } from './agent-seeder.service';

@Module({
  imports: [ConfigModule, OrchestrationModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentToolResolverService, AgentSeederService],
  exports: [AgentsService, AgentToolResolverService],
})
export class AgentsModule {}
