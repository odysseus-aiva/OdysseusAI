import { Injectable, Logger, Inject } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { CallAnalysis, CallSentiment } from '../common/types/call-log.types';
import {
  CALL_LOGS_REPOSITORY,
  type CallLogsRepository,
} from './interfaces/call-logs-repository.interface';
import type { ConversationStateRepository } from '../orchestration/interfaces/conversation-state-repository.interface';
import { CONVERSATION_STATE_REPOSITORY } from '../orchestration/interfaces/conversation-state-repository.interface';

@Injectable()
export class PostCallAnalysisService {
  private readonly logger = new Logger(PostCallAnalysisService.name);

  constructor(
    private readonly llmService: LlmService,
    @Inject(CALL_LOGS_REPOSITORY)
    private readonly callRepo: CallLogsRepository,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly convRepo: ConversationStateRepository,
  ) {}

  /**
   * Fire-and-forget — call from VoiceAgentService.stopSession without awaiting.
   * Reads the transcript from conversation state and writes analysis back to the call record.
   */
  async analyze(callId: string): Promise<void> {
    try {
      const state = await this.convRepo.findByCallId(callId);
      if (!state?.transcriptHistory?.length) {
        this.logger.debug(`[${callId}] No transcript — skipping analysis`);
        return;
      }

      const turns = state.transcriptHistory
        .filter((e) => e.text?.trim())
        .map((e) => `${e.role === 'user' ? 'User' : 'Agent'}: ${e.text.trim()}`)
        .join('\n');

      if (!turns) return;

      const prompt = [
        'Analyze this voice call transcript. Respond with JSON only, no markdown.',
        'Format: {"summary":"<1-2 sentence plain-English summary of what was discussed and resolved>","sentiment":"positive|negative|neutral"}',
        'The summary must be factual, past-tense, ≤200 chars. Sentiment reflects the user\'s outcome.',
        '',
        'Transcript:',
        turns,
      ].join('\n');

      let llmText = '';
      try {
        const result = await this.llmService.generateResponse({
          conversationHistory: [],
          userUtterance: prompt,
          messages: [{ role: 'user', content: prompt }],
        });
        llmText = result.text ?? '';
      } catch (err) {
        this.logger.warn(`[${callId}] LLM call failed during post-call analysis: ${(err as Error).message}`);
        return;
      }

      const analysis = this.parseAnalysis(llmText, callId);
      if (!analysis) return;

      await this.callRepo.writeAnalysis(callId, {
        ...analysis,
        analyzedAt: Date.now(),
      });

      this.logger.log(`[${callId}] Post-call analysis written: sentiment=${analysis.sentiment}`);
    } catch (err) {
      this.logger.warn(`[${callId}] Post-call analysis error: ${(err as Error).message}`);
    }
  }

  private parseAnalysis(
    text: string,
    callId: string,
  ): Omit<CallAnalysis, 'analyzedAt'> | null {
    try {
      // Strip possible markdown code fences
      const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 250) : undefined;
      const rawSentiment = typeof parsed.sentiment === 'string' ? parsed.sentiment.toLowerCase() : '';
      const sentiment: CallSentiment | undefined =
        rawSentiment === 'positive' || rawSentiment === 'negative' || rawSentiment === 'neutral'
          ? rawSentiment
          : undefined;

      if (!summary && !sentiment) return null;
      return { summary, sentiment };
    } catch {
      this.logger.warn(`[${callId}] Could not parse LLM analysis response: "${text.slice(0, 100)}"`);
      return null;
    }
  }
}
