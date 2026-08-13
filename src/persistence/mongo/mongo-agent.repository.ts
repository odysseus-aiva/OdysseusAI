import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AgentEngine,
  AgentRecord,
  AgentToolAssignment,
  CreateAgentInput,
  UpdateAgentInput,
  UpsertAgentToolInput,
} from '../../agents/interfaces/agent.types';
import { AgentRepository } from '../../agents/interfaces/agent-repository.interface';
import { AgentDocument, AgentEntity } from './schemas/agent.schema';
import {
  AgentToolDocument,
  AgentToolEntity,
} from './schemas/agent-tool.schema';

@Injectable()
export class MongoAgentRepository implements AgentRepository {
  constructor(
    @InjectModel(AgentEntity.name)
    private readonly agentModel: Model<AgentDocument>,
    @InjectModel(AgentToolEntity.name)
    private readonly agentToolModel: Model<AgentToolDocument>,
  ) {}

  async create(input: CreateAgentInput): Promise<AgentRecord> {
    const now = Date.now();
    const doc = await this.agentModel.create({
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
    });
    return this.toAgent(doc.toObject());
  }

  async findByAgentId(agentId: string): Promise<AgentRecord | null> {
    const doc = await this.agentModel.findOne({ agentId }).lean().exec();
    return doc ? this.toAgent(doc) : null;
  }

  async list(): Promise<AgentRecord[]> {
    const docs = await this.agentModel
      .find()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toAgent(d));
  }

  async update(
    agentId: string,
    patch: UpdateAgentInput,
  ): Promise<AgentRecord | null> {
    const updated = await this.agentModel
      .findOneAndUpdate(
        { agentId },
        { $set: { ...patch, updatedAt: Date.now() } },
        { new: true },
      )
      .lean()
      .exec();
    return updated ? this.toAgent(updated) : null;
  }

  async delete(agentId: string): Promise<boolean> {
    const result = await this.agentModel.deleteOne({ agentId }).exec();
    await this.agentToolModel.deleteMany({ agentId }).exec();
    return result.deletedCount > 0;
  }

  async listTools(agentId: string): Promise<AgentToolAssignment[]> {
    const docs = await this.agentToolModel
      .find({ agentId })
      .sort({ toolName: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toTool(d));
  }

  async upsertTools(
    agentId: string,
    tools: UpsertAgentToolInput[],
  ): Promise<AgentToolAssignment[]> {
    const now = Date.now();
    for (const tool of tools) {
      const existing = await this.agentToolModel
        .findOne({ agentId, toolName: tool.toolName })
        .lean()
        .exec();

      await this.agentToolModel
        .findOneAndUpdate(
          { agentId, toolName: tool.toolName },
          {
            $set: {
              enabled: tool.enabled,
              config: tool.config ?? existing?.config ?? {},
              updatedAt: now,
            },
            $setOnInsert: {
              agentId,
              toolName: tool.toolName,
              createdAt: now,
            },
          },
          { upsert: true },
        )
        .exec();
    }
    return this.listTools(agentId);
  }

  async findEnabledTools(agentId: string): Promise<AgentToolAssignment[]> {
    const docs = await this.agentToolModel
      .find({ agentId, enabled: true })
      .sort({ toolName: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toTool(d));
  }

  async deleteTool(agentId: string, toolName: string): Promise<boolean> {
    const res = await this.agentToolModel
      .deleteOne({ agentId, toolName })
      .exec();
    return res.deletedCount > 0;
  }

  private toAgent(doc: {
    agentId: string;
    name: string;
    engine?: string;
    systemPrompt?: string;
    greeting?: string;
    defaultProviders?: AgentRecord['defaultProviders'];
    voiceId?: string;
    language?: string;
    createdAt: number;
    updatedAt: number;
  }): AgentRecord {
    return {
      agentId: doc.agentId,
      name: doc.name,
      // Legacy docs have no engine → normalize to undefined; resolveForSession
      // applies the pipeline default.
      engine: normalizeEngine(doc.engine),
      systemPrompt: doc.systemPrompt,
      greeting: doc.greeting,
      defaultProviders: doc.defaultProviders,
      voiceId: doc.voiceId,
      language: doc.language,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toTool(doc: {
    agentId: string;
    toolName: string;
    enabled: boolean;
    config?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }): AgentToolAssignment {
    return {
      agentId: doc.agentId,
      toolName: doc.toolName,
      enabled: doc.enabled,
      config: { ...(doc.config ?? {}) },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

/** Coerce a stored engine string to the union, dropping unknown values. */
function normalizeEngine(engine?: string): AgentEngine | undefined {
  return engine === 'pipeline' || engine === 'omni' ? engine : undefined;
}
