import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  AgentSuggestionEntity,
  AgentSuggestionDocument,
  SuggestionStatus,
  SuggestionTargetType,
} from '../persistence/mongo/schemas/agent-suggestion.schema';
import { LlmService } from '../llm/llm.service';

export interface CreateSuggestionInput {
  agentId: string;
  callId: string;
  targetType: SuggestionTargetType;
  originalText: string;
  suggestedText: string;
}

export interface SuggestionRecord {
  suggestionId: string;
  agentId: string;
  callId: string;
  targetType: SuggestionTargetType;
  originalText: string;
  suggestedText: string;
  status: SuggestionStatus;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    @InjectModel(AgentSuggestionEntity.name)
    private readonly model: Model<AgentSuggestionDocument>,
    private readonly llmService: LlmService,
  ) {}

  async create(input: CreateSuggestionInput): Promise<SuggestionRecord> {
    const now = Date.now();
    const doc = await this.model.create({
      suggestionId: randomUUID(),
      agentId: input.agentId,
      callId: input.callId,
      targetType: input.targetType,
      originalText: input.originalText,
      suggestedText: input.suggestedText,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return this.toRecord(doc);
  }

  async listForAgent(agentId: string, status?: SuggestionStatus): Promise<SuggestionRecord[]> {
    const filter: Record<string, unknown> = { agentId };
    if (status) filter.status = status;
    const docs = await this.model.find(filter).sort({ createdAt: -1 }).exec();
    return docs.map((d) => this.toRecord(d));
  }

  async updateStatus(suggestionId: string, status: SuggestionStatus): Promise<SuggestionRecord> {
    const doc = await this.model.findOneAndUpdate(
      { suggestionId },
      { status, updatedAt: Date.now() },
      { new: true },
    );
    if (!doc) throw new NotFoundException(`Suggestion "${suggestionId}" not found`);
    return this.toRecord(doc);
  }

  /** Mark all pending suggestions for an agent + targetType as applied. */
  async markAllApplied(agentId: string, targetType: SuggestionTargetType): Promise<void> {
    await this.model.updateMany(
      { agentId, targetType, status: 'pending' },
      { status: 'applied', updatedAt: Date.now() },
    );
  }

  /**
   * Use LLM to synthesize the single best greeting from all pending suggestions.
   * Returns the synthesized greeting text and the count of source suggestions used.
   */
  async synthesizeGreeting(
    agentId: string,
    currentGreeting: string,
  ): Promise<{ synthesizedGreeting: string; sourceCount: number }> {
    const pending = await this.listForAgent(agentId, 'pending');
    const greetingSuggestions = pending.filter((s) => s.targetType === 'greeting');

    if (greetingSuggestions.length === 0) {
      return { synthesizedGreeting: currentGreeting, sourceCount: 0 };
    }

    const suggestionLines = greetingSuggestions
      .map((s, i) => `${i + 1}. "${s.suggestedText}"`)
      .join('\n');

    const prompt = [
      'You are a voice AI configuration expert. Based on a set of human reviewer suggestions collected from real call transcript reviews, synthesize ONE best improved greeting for a voice agent.',
      '',
      'Requirements:',
      '- The greeting must be natural to hear over the phone (short, warm, clear)',
      '- Incorporate the best ideas from the suggestions below',
      '- Output ONLY the greeting text. No explanation, no quotes, no JSON.',
      '',
      currentGreeting.trim()
        ? `Current greeting: "${currentGreeting.trim()}"`
        : 'No current greeting set.',
      '',
      `Reviewer suggestions from call transcripts (${greetingSuggestions.length} total):`,
      suggestionLines,
    ].join('\n');

    try {
      const result = await this.llmService.generateResponse({
        conversationHistory: [],
        userUtterance: prompt,
        messages: [{ role: 'user', content: prompt }],
      });
      const synthesized = (result.text ?? '').trim();
      return {
        synthesizedGreeting: synthesized || currentGreeting,
        sourceCount: greetingSuggestions.length,
      };
    } catch (err) {
      this.logger.warn(`Synthesis LLM call failed: ${(err as Error).message}`);
      return {
        synthesizedGreeting: greetingSuggestions[0].suggestedText,
        sourceCount: greetingSuggestions.length,
      };
    }
  }

  private toRecord(doc: AgentSuggestionDocument): SuggestionRecord {
    return {
      suggestionId: doc.suggestionId,
      agentId: doc.agentId,
      callId: doc.callId,
      targetType: doc.targetType,
      originalText: doc.originalText,
      suggestedText: doc.suggestedText,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
