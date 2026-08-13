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
import {
  CUSTOM_TOOL_KIND,
  CustomHttpToolDefinition,
  HTTP_METHODS,
  HttpMethod,
  isCustomHttpDefinition,
} from '../orchestration/tools/custom/custom-tool.types';
import {
  clampTimeout,
  maskDefinitionSecrets,
  restoreMaskedSecrets,
} from '../orchestration/tools/custom/custom-tool.util';
import { CustomHttpToolService } from '../orchestration/tools/custom/custom-http-tool.service';

/** Tool names must be safe LLM function identifiers. */
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

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

  async findByPhoneNumber(phoneNumber: string): Promise<AgentRecord | null> {
    return this.agentRepository.findByPhoneNumber(phoneNumber);
  }

  /** Assignments for the UI — custom-tool secret headers are masked. */
  async listTools(agentId: string): Promise<AgentToolAssignment[]> {
    await this.get(agentId);
    const tools = await this.agentRepository.listTools(agentId);
    return tools.map((t) =>
      isCustomHttpDefinition(t.config)
        ? {
            ...t,
            config: maskDefinitionSecrets(t.config) as unknown as Record<
              string,
              unknown
            >,
          }
        : t,
    );
  }

  async upsertTools(
    agentId: string,
    tools: UpsertAgentToolInput[],
  ): Promise<AgentToolAssignment[]> {
    await this.get(agentId);
    if (!Array.isArray(tools)) {
      throw new BadRequestException('tools must be an array');
    }

    // Existing raw assignments — used to restore masked secrets on update.
    const existing = await this.agentRepository.listTools(agentId);
    const existingByName = new Map(existing.map((t) => [t.toolName, t]));

    const normalized: UpsertAgentToolInput[] = tools.map((tool) => {
      if (!tool.toolName || typeof tool.toolName !== 'string') {
        throw new BadRequestException('Each tool requires toolName');
      }

      // Custom HTTP tool — its full definition rides in `config`.
      if (isCustomHttpDefinition(tool.config)) {
        const prior = existingByName.get(tool.toolName);
        const priorDef = isCustomHttpDefinition(prior?.config)
          ? prior?.config
          : undefined;
        return {
          toolName: tool.toolName,
          enabled: Boolean(tool.enabled),
          config: this.normalizeCustomTool(tool.toolName, tool.config, priorDef),
        };
      }

      // Built-in tool.
      if (!isKnownBuiltInTool(tool.toolName)) {
        throw new BadRequestException(`Unknown tool: ${tool.toolName}`);
      }
      const entry = getCatalogueEntry(tool.toolName);
      if (!entry?.assignable) {
        throw new BadRequestException(
          `Tool "${tool.toolName}" cannot be assigned to agents`,
        );
      }
      return {
        toolName: tool.toolName,
        enabled: Boolean(tool.enabled),
        config: this.mergeAndValidateConfig(tool.toolName, tool.config ?? {}),
      };
    });

    return this.agentRepository.upsertTools(agentId, normalized);
  }

  /**
   * Validate + normalize a user-defined HTTP tool definition for persistence.
   * Restores masked secret headers from the prior stored definition.
   */
  normalizeCustomTool(
    toolName: string,
    config: Record<string, unknown>,
    priorDef?: CustomHttpToolDefinition,
  ): Record<string, unknown> {
    if (!TOOL_NAME_PATTERN.test(toolName)) {
      throw new BadRequestException(
        `Invalid tool name "${toolName}": use letters, numbers, underscore (must start with a letter)`,
      );
    }
    if (isKnownBuiltInTool(toolName)) {
      throw new BadRequestException(
        `"${toolName}" is a built-in tool name; choose a different name`,
      );
    }

    const raw = config as unknown as CustomHttpToolDefinition;
    const def: CustomHttpToolDefinition = {
      kind: CUSTOM_TOOL_KIND,
      description: String(raw.description ?? '').trim(),
      method: (HTTP_METHODS.includes(raw.method) ? raw.method : 'GET') as HttpMethod,
      url: String(raw.url ?? '').trim(),
      headers: toStringMap(raw.headers),
      queryParams: toStringMap(raw.queryParams),
      bodyTemplate: raw.bodyTemplate,
      inputSchema:
        raw.inputSchema && typeof raw.inputSchema === 'object'
          ? raw.inputSchema
          : { type: 'object', properties: {}, additionalProperties: false },
      timeoutMs: clampTimeout(raw.timeoutMs),
      responseMapping: toStringMap(raw.responseMapping),
      resultInstruction: raw.resultInstruction
        ? String(raw.resultInstruction).trim()
        : undefined,
      speakDuringExecution: Boolean(raw.speakDuringExecution),
      executionMessage: raw.executionMessage
        ? String(raw.executionMessage)
        : undefined,
    };

    // Shape validation (method/url/description) — throws on problems.
    try {
      CustomHttpToolService.validateDefinition(def);
    } catch (err) {
      throw new BadRequestException(
        `Custom tool "${toolName}": ${(err as Error).message}`,
      );
    }

    return restoreMaskedSecrets(def, priorDef) as unknown as Record<string, unknown>;
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
      // Custom HTTP tool — the definition is the config (secrets intact here,
      // this feeds the live runtime, not the UI).
      if (isCustomHttpDefinition(assignment.config)) {
        enabledTools.push(assignment.toolName);
        toolConfigs[assignment.toolName] = this.normalizeCustomTool(
          assignment.toolName,
          assignment.config,
          assignment.config,
        );
        continue;
      }
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

  async deleteTool(agentId: string, toolName: string): Promise<boolean> {
    await this.get(agentId);
    return this.agentRepository.deleteTool(agentId, toolName);
  }

  /**
   * Unmasked runtime config for a single enabled tool (built-in or custom),
   * used by the "test assigned tool" endpoint. Returns null when not enabled.
   */
  async getEnabledToolConfig(
    agentId: string,
    toolName: string,
  ): Promise<{ config: Record<string, unknown>; isCustom: boolean } | null> {
    const enabled = await this.agentRepository.findEnabledTools(agentId);
    const assignment = enabled.find((a) => a.toolName === toolName);
    if (!assignment) return null;
    if (isCustomHttpDefinition(assignment.config)) {
      return {
        config: this.normalizeCustomTool(
          toolName,
          assignment.config,
          assignment.config,
        ),
        isCustom: true,
      };
    }
    if (!getCatalogueEntry(toolName)) return null;
    return {
      config: this.mergeAndValidateConfig(toolName, assignment.config),
      isCustom: false,
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

/** Coerce an unknown value into a string→string map, dropping nullish entries. */
function toStringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val == null || key.trim() === '') continue;
    out[key] = String(val);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
