import { Injectable } from '@nestjs/common';
import {
  AgentRecord,
  AgentToolAssignment,
  CreateAgentInput,
  UpdateAgentInput,
  UpsertAgentToolInput,
} from '../../agents/interfaces/agent.types';
import { AgentRepository } from '../../agents/interfaces/agent-repository.interface';

@Injectable()
export class InMemoryAgentRepository implements AgentRepository {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly tools = new Map<string, AgentToolAssignment>();

  private toolKey(agentId: string, toolName: string): string {
    return `${agentId}::${toolName}`;
  }

  async create(input: CreateAgentInput): Promise<AgentRecord> {
    const now = Date.now();
    const record: AgentRecord = {
      agentId: input.agentId,
      name: input.name,
      engine: input.engine,
      systemPrompt: input.systemPrompt,
      greeting: input.greeting,
      defaultProviders: input.defaultProviders,
      voiceId: input.voiceId,
      language: input.language,
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(input.agentId, record);
    return { ...record };
  }

  async findByAgentId(agentId: string): Promise<AgentRecord | null> {
    const record = this.agents.get(agentId);
    return record ? { ...record } : null;
  }

  async list(): Promise<AgentRecord[]> {
    return Array.from(this.agents.values())
      .map((a) => ({ ...a }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async update(
    agentId: string,
    patch: UpdateAgentInput,
  ): Promise<AgentRecord | null> {
    const existing = this.agents.get(agentId);
    if (!existing) return null;
    const updated: AgentRecord = {
      ...existing,
      ...patch,
      agentId: existing.agentId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.agents.set(agentId, updated);
    return { ...updated };
  }

  async delete(agentId: string): Promise<boolean> {
    const existed = this.agents.delete(agentId);
    for (const key of Array.from(this.tools.keys())) {
      if (key.startsWith(`${agentId}::`)) {
        this.tools.delete(key);
      }
    }
    return existed;
  }

  async listTools(agentId: string): Promise<AgentToolAssignment[]> {
    return Array.from(this.tools.values())
      .filter((t) => t.agentId === agentId)
      .map((t) => ({ ...t, config: { ...t.config } }))
      .sort((a, b) => a.toolName.localeCompare(b.toolName));
  }

  async upsertTools(
    agentId: string,
    tools: UpsertAgentToolInput[],
  ): Promise<AgentToolAssignment[]> {
    const now = Date.now();
    for (const tool of tools) {
      const key = this.toolKey(agentId, tool.toolName);
      const existing = this.tools.get(key);
      const assignment: AgentToolAssignment = {
        agentId,
        toolName: tool.toolName,
        enabled: tool.enabled,
        config: { ...(tool.config ?? existing?.config ?? {}) },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.tools.set(key, assignment);
    }
    return this.listTools(agentId);
  }

  async findEnabledTools(agentId: string): Promise<AgentToolAssignment[]> {
    return (await this.listTools(agentId)).filter((t) => t.enabled);
  }
}
