/**
 * Per-call cost accounting. Mirrors how `LatencyMetrics` is accumulated per turn
 * and flushed at finalize — see PerformanceService / CostService.
 *
 * All monetary values are USD. Token/char/second counts are raw usage so the UI
 * can re-derive or re-price later without replaying the call.
 */

export interface LlmTokenUsage {
  /** Runtime model id echoed by the provider (keys the rate table). */
  model?: string;
  promptTokens: number;
  completionTokens: number;
}

export interface CallCost {
  /** llmUsd + ttsUsd + sttUsd, rounded to 6 dp. */
  totalUsd: number;
  llmUsd: number;
  ttsUsd: number;
  sttUsd: number;
  breakdown: {
    llm: {
      model?: string;
      promptTokens: number;
      completionTokens: number;
      usd: number;
    };
    tts: {
      provider?: string;
      characters: number;
      usd: number;
    };
    stt: {
      provider?: string;
      /** Audio seconds billed — the full call duration for streaming STT. */
      seconds: number;
      usd: number;
    };
  };
  /** True when any usage component fell back to a default rate (unknown model). */
  estimated: boolean;
  computedAt: number;
}
