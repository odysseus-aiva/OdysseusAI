import { Module, OnModuleInit } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { OrchestratorService } from './orchestrator.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ConversationStateService } from './conversation-state.service';
import { ConversationCleanupService } from './conversation-cleanup.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionService } from './tool-execution.service';
import { ResponsePlannerService } from './response-planner.service';
import { GuardrailService } from './guardrail.service';
import { EventLoggerService } from './event-logger.service';
import { GetUserDetailsTool } from './tools/get-user-details.tool';
import { GetCurrentDatetimeTool } from './tools/get-current-datetime.tool';
import { EndCallTool } from './tools/end-call.tool';
import { GetWeatherTool } from './tools/get-weather.tool';
import { WebSearchTool } from './tools/web-search/web-search.tool';
import { TavilyWebSearchProvider } from './tools/web-search/tavily-web-search.provider';
import { BraveWebSearchProvider } from './tools/web-search/brave-web-search.provider';
import { CustomHttpToolService } from './tools/custom/custom-http-tool.service';

@Module({
  imports: [LlmModule, CallLogsModule],
  providers: [
    OrchestratorService,
    PromptBuilderService,
    ConversationStateService,
    ConversationCleanupService,
    ToolRegistryService,
    ToolExecutionService,
    CustomHttpToolService,
    ResponsePlannerService,
    GuardrailService,
    EventLoggerService,
    GetUserDetailsTool,
    GetCurrentDatetimeTool,
    EndCallTool,
    GetWeatherTool,
    TavilyWebSearchProvider,
    BraveWebSearchProvider,
    WebSearchTool,
  ],
  exports: [
    OrchestratorService,
    ConversationStateService,
    ToolRegistryService,
    ToolExecutionService,
    CustomHttpToolService,
  ],
})
export class OrchestrationModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly getUserDetailsTool: GetUserDetailsTool,
    private readonly getCurrentDatetimeTool: GetCurrentDatetimeTool,
    private readonly endCallTool: EndCallTool,
    private readonly getWeatherTool: GetWeatherTool,
    private readonly webSearchTool: WebSearchTool,
  ) {}

  onModuleInit(): void {
    this.toolRegistry.register(this.getUserDetailsTool);
    this.toolRegistry.register(this.getCurrentDatetimeTool);
    this.toolRegistry.register(this.endCallTool);
    this.toolRegistry.register(this.getWeatherTool);
    this.toolRegistry.register(this.webSearchTool);
  }
}
