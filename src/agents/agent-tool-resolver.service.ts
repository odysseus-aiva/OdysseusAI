import { Injectable } from '@nestjs/common';
import { AgentConfig } from '../common/types/voice-agent.types';
import { AgentsService } from './agents.service';
import { ResolvedAgentSessionConfig } from './interfaces/agent.types';

/**
 * Merges Mongo agent definition + enabled tool assignments into a session AgentConfig.
 * Request overrides may further restrict tools, never expand beyond assigned+enabled.
 */
@Injectable()
export class AgentToolResolverService {
  constructor(private readonly agentsService: AgentsService) {}

  async resolve(
    partial?: AgentConfig,
  ): Promise<AgentConfig & { toolConfigs?: Record<string, Record<string, unknown>> }> {
    if (!partial?.agentId) {
      // Legacy / ad-hoc sessions without an agent profile:
      // - explicit enabledTools (including []) are honored
      // - omitted enabledTools keeps undefined (registry may list all for POC)
      return { ...partial };
    }

    const resolved: ResolvedAgentSessionConfig =
      await this.agentsService.resolveForSession(partial.agentId);

    let enabledTools = [...resolved.enabledTools];
    if (partial.enabledTools !== undefined) {
      const requested = new Set(partial.enabledTools);
      enabledTools = enabledTools.filter((name) => requested.has(name));
    }

    const toolConfigs: Record<string, Record<string, unknown>> = {};
    for (const name of enabledTools) {
      toolConfigs[name] = resolved.toolConfigs[name] ?? {};
    }

    return {
      ...partial,
      agentId: resolved.agentId,
      agentName: resolved.name,
      // Engine is an agent-level property; a per-request override may still pick
      // it (e.g. Engine Compare), otherwise the persisted engine wins.
      engine: partial.engine ?? resolved.engine,
      systemPrompt: partial.systemPrompt ?? resolved.systemPrompt,
      greeting: partial.greeting ?? resolved.greeting,
      sttProvider: partial.sttProvider ?? resolved.sttProvider,
      llmProvider: partial.llmProvider ?? resolved.llmProvider,
      ttsProvider: partial.ttsProvider ?? resolved.ttsProvider,
      voiceId: partial.voiceId ?? resolved.voiceId,
      language: partial.language ?? resolved.language,
      enabledTools,
      toolConfigs,
    };
  }
}
