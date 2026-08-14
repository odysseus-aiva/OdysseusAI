/**
 * Provider pricing, keyed by the model id each provider reports at runtime.
 *
 * Rates are public list prices as of 2025 and are intentionally in one editable
 * table — no rate is hardcoded at a call site. Values are USD.
 *
 * Matching is longest-prefix so dated snapshots (e.g. `gpt-4o-mini-2024-07-18`)
 * resolve to their base entry without a table update.
 */

export interface LlmRate {
  /** USD per 1M prompt tokens. */
  inputPerMillion: number;
  /** USD per 1M completion tokens. */
  outputPerMillion: number;
}

/** USD per 1M characters synthesized. */
export type TtsRate = number;

/** USD per audio minute transcribed. */
export type SttRate = number;

export const LLM_RATES: Record<string, LlmRate> = {
  // OpenAI
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  // Anthropic
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-3-5-haiku': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
};

/** Fallback when a model id matches no entry. Priced conservatively (mini-tier). */
export const DEFAULT_LLM_RATE: LlmRate = { inputPerMillion: 0.5, outputPerMillion: 1.5 };

export const TTS_RATES: Record<string, TtsRate> = {
  // provider name → USD per 1M chars
  openai: 15, // tts-1
  elevenlabs: 100, // turbo tier, ~$0.10 / 1k chars
  cartesia: 40,
};

export const DEFAULT_TTS_RATE: TtsRate = 15;

export const STT_RATES: Record<string, SttRate> = {
  deepgram: 0.0043, // nova-2 streaming, USD/min
};

export const DEFAULT_STT_RATE: SttRate = 0.0043;

/** Longest-prefix match so dated model snapshots resolve to their base rate. */
export function resolveLlmRate(model: string | undefined): {
  rate: LlmRate;
  matched: boolean;
} {
  if (!model) return { rate: DEFAULT_LLM_RATE, matched: false };
  const exact = LLM_RATES[model];
  if (exact) return { rate: exact, matched: true };

  let best: { key: string; rate: LlmRate } | null = null;
  for (const [key, rate] of Object.entries(LLM_RATES)) {
    if (model.startsWith(key) && (!best || key.length > best.key.length)) {
      best = { key, rate };
    }
  }
  return best ? { rate: best.rate, matched: true } : { rate: DEFAULT_LLM_RATE, matched: false };
}

export function resolveTtsRate(provider: string | undefined): {
  rate: TtsRate;
  matched: boolean;
} {
  if (provider && provider in TTS_RATES) return { rate: TTS_RATES[provider], matched: true };
  return { rate: DEFAULT_TTS_RATE, matched: false };
}

export function resolveSttRate(provider: string | undefined): {
  rate: SttRate;
  matched: boolean;
} {
  if (provider && provider in STT_RATES) return { rate: STT_RATES[provider], matched: true };
  return { rate: DEFAULT_STT_RATE, matched: false };
}
