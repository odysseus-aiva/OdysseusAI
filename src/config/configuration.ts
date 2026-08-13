export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  livekit: {
    url: process.env.LIVEKIT_URL ?? '',
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
    webhookSecret: process.env.LIVEKIT_WEBHOOK_SECRET ?? '',
    // SIP/telephony placeholders — wire to LiveKit SIP trunk when ready
    sip: {
      enabled: process.env.LIVEKIT_SIP_ENABLED === 'true',
      trunkId: process.env.LIVEKIT_SIP_TRUNK_ID ?? '',
      dispatchRuleId: process.env.LIVEKIT_SIP_DISPATCH_RULE_ID ?? '',
    },
  },
  providers: {
    stt: process.env.DEFAULT_STT_PROVIDER ?? 'deepgram',
    llm: process.env.DEFAULT_LLM_PROVIDER ?? 'openai',
    tts: process.env.DEFAULT_TTS_PROVIDER ?? 'openai',
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY ?? '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
  },
  cartesia: {
    apiKey: process.env.CARTESIA_API_KEY ?? '',
  },
  pyai: {
    apiKey: process.env.PYAI_API_KEY ?? '',
    baseUrl: process.env.PYAI_BASE_URL ?? 'https://api.pyai.com/v1',
  },
  orchestration: {
    maxToolLoops: Number.parseInt(process.env.ORCHESTRATION_MAX_TOOL_LOOPS ?? '3', 10),
    toolTimeoutMs: Number.parseInt(
      process.env.ORCHESTRATION_TOOL_TIMEOUT_MS ?? '12000',
      10,
    ),
    fallbackResponse:
      process.env.ORCHESTRATION_FALLBACK_RESPONSE ??
      "I'm sorry, I had trouble with that. Could you try again?",
  },
  webSearch: {
    provider: process.env.WEB_SEARCH_PROVIDER ?? 'tavily',
  },
  customTools: {
    /**
     * Optional comma-separated allowlist of hostnames custom HTTP tools may call.
     * When empty, a private/reserved-address denylist is enforced instead.
     */
    allowedHosts: process.env.CUSTOM_TOOL_ALLOWED_HOSTS ?? '',
  },
  tavily: {
    apiKey: process.env.TAVILY_API_KEY ?? '',
  },
  braveSearch: {
    apiKey: process.env.BRAVE_SEARCH_API_KEY ?? '',
  },
  persistence: {
    /** `memory` (default) or `mongodb` */
    provider: process.env.PERSISTENCE_PROVIDER ?? 'memory',
    mongodb: {
      /** Full connection string — only env change needed to switch deployments */
      uri: process.env.MONGODB_URI ?? '',
      /** Optional; database name can also be set in MONGODB_URI */
      dbName: process.env.MONGODB_DB_NAME ?? 'odysseus_ai',
    },
  },
  /** Barge-in / interruption while the agent is speaking (Deepgram + clearQueue). */
  bargeIn: {
    enabled: process.env.BARGE_IN_ENABLED === 'true',
    minVoiceMs: Number.parseInt(process.env.BARGE_IN_MIN_VOICE_MS ?? '300', 10),
    startHoldoffMs: Number.parseInt(
      process.env.BARGE_IN_START_HOLDOFF_MS ?? '400',
      10,
    ),
    backoffMs: Number.parseInt(process.env.BARGE_IN_BACKOFF_MS ?? '700', 10),
  },
});
