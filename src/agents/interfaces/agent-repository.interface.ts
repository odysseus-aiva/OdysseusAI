import {
  AgentRecord,
  AgentToolAssignment,
  CreateAgentInput,
  UpdateAgentInput,
  UpsertAgentToolInput,
} from './agent.types';

export const AGENT_REPOSITORY = Symbol('AGENT_REPOSITORY');

export interface AgentRepository {
  create(input: CreateAgentInput): Promise<AgentRecord>;
  findByAgentId(agentId: string): Promise<AgentRecord | null>;
  findByPhoneNumber(phoneNumber: string): Promise<AgentRecord | null>;
  list(): Promise<AgentRecord[]>;
  update(agentId: string, patch: UpdateAgentInput): Promise<AgentRecord | null>;
  delete(agentId: string): Promise<boolean>;

  listTools(agentId: string): Promise<AgentToolAssignment[]>;
  upsertTools(
    agentId: string,
    tools: UpsertAgentToolInput[],
  ): Promise<AgentToolAssignment[]>;
  findEnabledTools(agentId: string): Promise<AgentToolAssignment[]>;
  /** Remove a single tool assignment. Returns true if one was deleted. */
  deleteTool(agentId: string, toolName: string): Promise<boolean>;
}
