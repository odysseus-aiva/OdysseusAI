/**
 * Provider and voice metadata for the Voice tab.
 *
 * Mirrors the backend's implemented providers (see `src/config/configuration.ts`
 * and the `stt/`, `llm/`, `tts/` provider directories). Adding a provider is one
 * entry here plus the backend implementation — the UI needs no other change.
 */

export interface ProviderOption {
  id: string;
  label: string;
  /** Short differentiator shown under the name in the picker. */
  note: string;
  /** True when the provider needs an API key beyond the platform default. */
  requiresKey?: boolean;
}

export const STT_PROVIDERS: ProviderOption[] = [
  { id: 'deepgram', label: 'Deepgram', note: 'Streaming, lowest latency' },
  { id: 'pyai', label: 'PyAI Hear', note: 'Streaming partials ~300ms', requiresKey: true },
];

export const LLM_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI', note: 'GPT models, tool calling' },
  { id: 'claude', label: 'Claude', note: 'Anthropic, strong instruction following' },
];

export const TTS_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI', note: 'Six preset voices' },
  { id: 'cartesia', label: 'Cartesia', note: 'Native PCM, fastest playback', requiresKey: true },
  { id: 'elevenlabs', label: 'ElevenLabs', note: 'Highest voice quality', requiresKey: true },
  { id: 'pyai', label: 'PyAI Speak', note: 'Stock, cloned, or designed voices', requiresKey: true },
];

/** Server defaults, used to label the "Default" option honestly. */
export const PLATFORM_DEFAULTS = {
  stt: 'deepgram',
  llm: 'openai',
  tts: 'openai',
} as const;

/** Preset voices per TTS provider. Absent = provider takes a free-form voice ID. */
const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy — neutral, balanced' },
  { id: 'echo', label: 'Echo — warm, measured' },
  { id: 'fable', label: 'Fable — expressive, bright' },
  { id: 'onyx', label: 'Onyx — deep, authoritative' },
  { id: 'nova', label: 'Nova — energetic, youthful' },
  { id: 'shimmer', label: 'Shimmer — soft, airy' },
];

export const PRESET_VOICES: Record<string, { id: string; label: string }[]> = {
  openai: OPENAI_VOICES,
  // PyAI Speak accepts OpenAI voice aliases, so the same presets carry over.
  pyai: OPENAI_VOICES,
};

export const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'zh', label: 'Chinese' },
];

/** Languages supported by PyAI Omni end-to-end (STT + LLM + TTS). */
export const OMNI_LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
  { id: 'de', label: 'German' },
  { id: 'hi', label: 'Hindi' },
];

export function providerLabel(list: ProviderOption[], id: string | undefined): string {
  if (!id) return '';
  return list.find((p) => p.id === id)?.label ?? id;
}

export function languageLabel(id: string | undefined): string {
  if (!id) return '';
  return LANGUAGES.find((l) => l.id === id)?.label ?? id.toUpperCase();
}
