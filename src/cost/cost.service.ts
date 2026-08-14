import { Injectable, Logger } from '@nestjs/common';
import type { CallCost, LlmTokenUsage } from '../common/types/cost.types';
import {
  resolveLlmRate,
  resolveTtsRate,
  resolveSttRate,
} from './cost-rates';

/**
 * In-memory per-call usage accumulator, keyed by callId — same lifecycle model
 * as PerformanceService. Raw usage is added as it happens during a call, then
 * priced into a CallCost at finalize.
 *
 * The map entry is created lazily on first usage and cleared after finalize, so
 * an abandoned call never leaks (the orphan-cleanup path calls clearRecord too).
 */
interface CostAccumulator {
  llmPromptTokens: number;
  llmCompletionTokens: number;
  /** Last non-empty model id seen — assumed stable for the call. */
  llmModel?: string;
  ttsCharacters: number;
  ttsProvider?: string;
  sttSeconds: number;
  sttProvider?: string;
}

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);
  private readonly records = new Map<string, CostAccumulator>();
  private static readonly OMNI_RATE_PER_SECOND = 0.05 / 60;

  private getOrCreate(callId: string): CostAccumulator {
    let rec = this.records.get(callId);
    if (!rec) {
      rec = {
        llmPromptTokens: 0,
        llmCompletionTokens: 0,
        ttsCharacters: 0,
        sttSeconds: 0,
      };
      this.records.set(callId, rec);
    }
    return rec;
  }

  /** Add one LLM call's token usage. Called once per loop iteration per turn. */
  addLlmUsage(callId: string, usage: LlmTokenUsage): void {
    const rec = this.getOrCreate(callId);
    rec.llmPromptTokens += usage.promptTokens || 0;
    rec.llmCompletionTokens += usage.completionTokens || 0;
    if (usage.model) rec.llmModel = usage.model;
  }

  /** Add synthesized character count for one TTS request. */
  addTtsUsage(callId: string, characters: number, provider?: string): void {
    const rec = this.getOrCreate(callId);
    rec.ttsCharacters += Math.max(0, characters);
    if (provider) rec.ttsProvider = provider;
  }

  /** Record the STT provider so streaming duration can be priced at finalize. */
  setSttProvider(callId: string, provider?: string): void {
    if (!provider) return;
    this.getOrCreate(callId).sttProvider = provider;
  }

  /**
   * Price accumulated usage into a CallCost. `sttSeconds` comes from the caller
   * (full call duration) since streaming STT reports no per-request usage.
   */
  finalize(callId: string, sttSeconds: number): CallCost {
    const rec = this.records.get(callId) ?? {
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      ttsCharacters: 0,
      sttSeconds: 0,
    };

    const llm = resolveLlmRate(rec.llmModel);
    const tts = resolveTtsRate(rec.ttsProvider);
    const stt = resolveSttRate(rec.sttProvider);

    const llmUsd =
      (rec.llmPromptTokens / 1_000_000) * llm.rate.inputPerMillion +
      (rec.llmCompletionTokens / 1_000_000) * llm.rate.outputPerMillion;
    const ttsUsd = (rec.ttsCharacters / 1_000_000) * tts.rate;
    const billedSeconds = Math.max(0, sttSeconds);
    const sttUsd = (billedSeconds / 60) * stt.rate;

    const cost: CallCost = {
      totalUsd: round6(llmUsd + ttsUsd + sttUsd),
      llmUsd: round6(llmUsd),
      ttsUsd: round6(ttsUsd),
      sttUsd: round6(sttUsd),
      breakdown: {
        llm: {
          model: rec.llmModel,
          promptTokens: rec.llmPromptTokens,
          completionTokens: rec.llmCompletionTokens,
          usd: round6(llmUsd),
        },
        tts: {
          provider: rec.ttsProvider,
          characters: rec.ttsCharacters,
          usd: round6(ttsUsd),
        },
        stt: {
          provider: rec.sttProvider,
          seconds: Math.round(billedSeconds),
          usd: round6(sttUsd),
        },
      },
      // Any component missing a real rate makes the total an estimate.
      estimated: !llm.matched || !tts.matched || !stt.matched,
      computedAt: Date.now(),
    };

    this.logger.log(
      `[${callId}] cost total=$${cost.totalUsd} (llm=$${cost.llmUsd} tts=$${cost.ttsUsd} stt=$${cost.sttUsd})`,
    );
    return cost;
  }

  /**
   * Price an Omni call using the flat duration-based rate ($0.05/min, per-second).
   * Never calls addLlmUsage / addTtsUsage — no component breakdown applies.
   */
  finalizeOmni(callId: string, durationSeconds: number): CallCost {
    const omniUsd = round6(Math.max(0, durationSeconds) * CostService.OMNI_RATE_PER_SECOND);
    this.logger.log(
      `[${callId}] omni cost total=$${omniUsd} (${durationSeconds.toFixed(1)}s × $0.05/min)`,
    );
    return {
      totalUsd: omniUsd,
      llmUsd: 0,
      ttsUsd: 0,
      sttUsd: 0,
      omniUsd,
      pricingModel: 'omni',
      breakdown: {
        llm: { promptTokens: 0, completionTokens: 0, usd: 0 },
        tts: { characters: 0, usd: 0 },
        stt: { seconds: Math.round(Math.max(0, durationSeconds)), usd: 0 },
      },
      estimated: false,
      computedAt: Date.now(),
    };
  }

  clearRecord(callId: string): void {
    this.records.delete(callId);
  }
}

/** Costs are tiny; keep 6 dp so sub-cent turns don't round to zero. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
