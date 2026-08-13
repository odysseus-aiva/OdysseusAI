import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  BUILT_IN_TOOLS_CATALOGUE,
  getCatalogueEntry,
  isKnownBuiltInTool,
  listAssignableCatalogue,
} from '../orchestration/tools/catalogue/built-in-tools.catalogue';
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from './interfaces/agent-repository.interface';
import {
  AgentRecord,
  AgentToolAssignment,
  CreateAgentInput,
  DEFAULT_AGENT_ENGINE,
  ResolvedAgentSessionConfig,
  UpdateAgentInput,
  UpsertAgentToolInput,
} from './interfaces/agent.types';

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;

@Injectable()
export class AgentsService {
  constructor(
    @Inject(AGENT_REPOSITORY)
    private readonly agentRepository: AgentRepository,
  ) {}

  listCatalogue(assignableOnly = true) {
    return assignableOnly
      ? listAssignableCatalogue()
      : [...BUILT_IN_TOOLS_CATALOGUE];
  }

  async create(input: CreateAgentInput): Promise<AgentRecord> {
    this.validateAgentId(input.agentId);
    if (!input.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const existing = await this.agentRepository.findByAgentId(input.agentId);
    if (existing) {
      throw new BadRequestException(
        `Agent "${input.agentId}" already exists`,
      );
    }
    return this.agentRepository.create({
      ...input,
      name: input.name.trim(),
      systemPrompt: input.systemPrompt?.trim(),
    });
  }

  async list(): Promise<AgentRecord[]> {
    return this.agentRepository.list();
  }

  async get(agentId: string): Promise<AgentRecord> {
    const agent = await this.agentRepository.findByAgentId(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }
    return agent;
  }

  async update(agentId: string, patch: UpdateAgentInput): Promise<AgentRecord> {
    const updated = await this.agentRepository.update(agentId, patch);
    if (!updated) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }
    return updated;
  }

  async delete(agentId: string): Promise<void> {
    const deleted = await this.agentRepository.delete(agentId);
    if (!deleted) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }
  }

  async listTools(agentId: string): Promise<AgentToolAssignment[]> {
    await this.get(agentId);
    return this.agentRepository.listTools(agentId);
  }

  async upsertTools(
    agentId: string,
    tools: UpsertAgentToolInput[],
  ): Promise<AgentToolAssignment[]> {
    await this.get(agentId);
    if (!Array.isArray(tools)) {
      throw new BadRequestException('tools must be an array');
    }

    const normalized: UpsertAgentToolInput[] = tools.map((tool) => {
      if (!tool.toolName || typeof tool.toolName !== 'string') {
        throw new BadRequestException('Each tool requires toolName');
      }
      if (!isKnownBuiltInTool(tool.toolName)) {
        throw new BadRequestException(`Unknown tool: ${tool.toolName}`);
      }
      const entry = getCatalogueEntry(tool.toolName);
      if (!entry?.assignable) {
        throw new BadRequestException(
          `Tool "${tool.toolName}" cannot be assigned to agents`,
        );
      }
      const config = this.mergeAndValidateConfig(
        tool.toolName,
        tool.config ?? {},
      );
      return {
        toolName: tool.toolName,
        enabled: Boolean(tool.enabled),
        config,
      };
    });

    return this.agentRepository.upsertTools(agentId, normalized);
  }

  /**
   * Resolve session tool allowlist + agent defaults.
   * Only enabled assigned tools are returned. Empty list = no tools.
   */
  async resolveForSession(
    agentId: string,
  ): Promise<ResolvedAgentSessionConfig> {
    const agent = await this.get(agentId);
    const enabledAssignments =
      await this.agentRepository.findEnabledTools(agentId);

    const enabledTools: string[] = [];
    const toolConfigs: Record<string, Record<string, unknown>> = {};

    for (const assignment of enabledAssignments) {
      const entry = getCatalogueEntry(assignment.toolName);
      if (!entry || !entry.assignable) continue;
      enabledTools.push(assignment.toolName);
      toolConfigs[assignment.toolName] = this.mergeAndValidateConfig(
        assignment.toolName,
        assignment.config,
      );
    }

    return {
      agentId: agent.agentId,
      name: agent.name,
      engine: agent.engine ?? DEFAULT_AGENT_ENGINE,
      systemPrompt: agent.systemPrompt,
      greeting: agent.greeting,
      sttProvider: agent.defaultProviders?.stt,
      llmProvider: agent.defaultProviders?.llm,
      ttsProvider: agent.defaultProviders?.tts,
      voiceId: agent.voiceId,
      language: agent.language,
      enabledTools,
      toolConfigs,
    };
  }

  mergeAndValidateConfig(
    toolName: string,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const entry = getCatalogueEntry(toolName);
    if (!entry) {
      throw new BadRequestException(`Unknown tool: ${toolName}`);
    }

    const merged: Record<string, unknown> = {
      ...entry.defaultConfig,
      ...config,
    };

    // Lightweight validation against known keys from configSchema
    const props = (entry.configSchema.properties ?? {}) as Record<
      string,
      { type?: string; enum?: unknown[]; minimum?: number; maximum?: number }
    >;

    for (const key of Object.keys(merged)) {
      if (!(key in props) && entry.configSchema.additionalProperties === false) {
        delete merged[key];
        continue;
      }
      const schema = props[key];
      if (!schema) continue;
      const value = merged[key];

      if (schema.enum && !schema.enum.includes(value)) {
        throw new BadRequestException(
          `Invalid config.${key} for ${toolName}: must be one of ${schema.enum.join(', ')}`,
        );
      }
      if (schema.type === 'integer' || schema.type === 'number') {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          throw new BadRequestException(
            `Invalid config.${key} for ${toolName}: must be a number`,
          );
        }
        if (schema.minimum !== undefined && num < schema.minimum) {
          throw new BadRequestException(
            `Invalid config.${key} for ${toolName}: min ${schema.minimum}`,
          );
        }
        if (schema.maximum !== undefined && num > schema.maximum) {
          throw new BadRequestException(
            `Invalid config.${key} for ${toolName}: max ${schema.maximum}`,
          );
        }
        merged[key] = schema.type === 'integer' ? Math.trunc(num) : num;
      }
      if (schema.type === 'boolean') {
        merged[key] = Boolean(value);
      }
      if (schema.type === 'string') {
        merged[key] = String(value ?? '');
      }
      if (schema.type === 'array') {
        if (!Array.isArray(value)) {
          throw new BadRequestException(
            `Invalid config.${key} for ${toolName}: must be an array`,
          );
        }
        merged[key] = value.map(String).filter(Boolean);
      }
    }

    return merged;
  }

  private validateAgentId(agentId: string): void {
    if (!agentId || !AGENT_ID_PATTERN.test(agentId)) {
      throw new BadRequestException(
        'agentId must be 3–64 chars: lowercase letters, numbers, hyphens, underscores',
      );
    }
  }
}
