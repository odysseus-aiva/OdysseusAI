import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentsService } from './agents.service';
import { ToolRegistryService } from '../orchestration/tool-registry.service';
import { ToolExecutionService } from '../orchestration/tool-execution.service';
import {
  CreateAgentDto,
  TestAgentToolDto,
  UpdateAgentDto,
  UpsertAgentToolsDto,
} from './dto/agents.dto';

interface OmniVoice {
  voice_id: string;
  name: string;
  /** May be a bare code ('en') or a locale ('en-US', 'en-GB'). */
  language: string;
  gender: string;
  region: string;
  accent?: string;
  tone?: string;
  bio?: string;
  age?: string;
  age_band?: string;
  use_cases?: string[];
  search_tags?: string[];
  avatar_url?: string;
  source?: string;
}

@Controller()
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);
  private omniVoicesCache: OmniVoice[] | null = null;
  private omniVoicesCachedAt = 0;
  private static readonly VOICES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly agentsService: AgentsService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecution: ToolExecutionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('agents/omni/voices')
  async getOmniVoices(): Promise<{ voices: OmniVoice[] }> {
    const now = Date.now();
    if (
      this.omniVoicesCache &&
      now - this.omniVoicesCachedAt < AgentsController.VOICES_CACHE_TTL_MS
    ) {
      return { voices: this.omniVoicesCache };
    }

    const baseUrl = this.configService.get<string>('pyai.baseUrl') ?? 'https://api.pyai.com/v1';
    // Read the env var directly for consistency with the STT/TTS/Omni consumers
    // (which all use PYAI_API_KEY); fall back to the loaded config namespace.
    const apiKey =
      this.configService.get<string>('PYAI_API_KEY') ??
      this.configService.get<string>('pyai.apiKey') ??
      '';
    try {
      const res = await fetch(`${baseUrl}/voices`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`PyAI voices API returned ${res.status}`);
      }
      // PyAI returns { object: 'list', data: [...] }
      const body = (await res.json()) as
        | { object: string; data: OmniVoice[] }
        | OmniVoice[];
      const voices = Array.isArray(body) ? body : (body.data ?? []);
      this.omniVoicesCache = voices;
      this.omniVoicesCachedAt = now;
      return { voices };
    } catch (err) {
      this.logger.error(`Failed to fetch PyAI voices: ${(err as Error).message}`);
      // Return cached stale data if available rather than hard-failing
      if (this.omniVoicesCache) {
        return { voices: this.omniVoicesCache };
      }
      throw new InternalServerErrorException('Could not fetch PyAI voice catalog');
    }
  }

  @Get('tools/catalogue')
  getCatalogue(@Query('all') all?: string) {
    return {
      tools: this.agentsService.listCatalogue(all !== 'true'),
    };
  }

  @Get('agents')
  listAgents() {
    return this.agentsService.list();
  }

  @Post('agents')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Get('agents/:agentId')
  getAgent(@Param('agentId') agentId: string) {
    return this.agentsService.get(agentId);
  }

  @Put('agents/:agentId')
  updateAgent(
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(agentId, dto);
  }

  @Delete('agents/:agentId')
  async deleteAgent(@Param('agentId') agentId: string) {
    await this.agentsService.delete(agentId);
    return { ok: true };
  }

  @Get('agents/:agentId/tools')
  listTools(@Param('agentId') agentId: string) {
    return this.agentsService.listTools(agentId);
  }

  @Put('agents/:agentId/tools')
  upsertTools(
    @Param('agentId') agentId: string,
    @Body() dto: UpsertAgentToolsDto,
  ) {
    return this.agentsService.upsertTools(agentId, dto.tools);
  }

  @Post('agents/:agentId/tools/:toolName/test')
  async testTool(
    @Param('agentId') agentId: string,
    @Param('toolName') toolName: string,
    @Body() dto: TestAgentToolDto,
  ) {
    const assignments = await this.agentsService.listTools(agentId);
    const assignment = assignments.find((t) => t.toolName === toolName);
    if (!assignment?.enabled) {
      return {
        success: false,
        error: `Tool "${toolName}" is not enabled for agent "${agentId}"`,
      };
    }

    const config = this.agentsService.mergeAndValidateConfig(
      toolName,
      assignment.config,
    );

    if (!this.toolRegistry.has(toolName)) {
      return {
        success: false,
        error: `Tool "${toolName}" is not registered in the runtime catalogue`,
      };
    }

    return this.toolExecution.execute(toolName, dto.args ?? {}, {
      callId: `test-${agentId}-${Date.now()}`,
      roomName: 'tool-test',
      agentId,
      dynamicVariables: {},
      metadata: { test: true },
      toolConfigs: { [toolName]: config },
    });
  }
}
