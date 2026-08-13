# Engine Architecture Analysis — Default Pipeline vs PyAI Omni

## End-to-End Flows

### Default Pipeline

```
startSession
  └─ agentToolResolver.resolve(agentId)
       → enabledTools[], toolConfigs, sttProvider, llmProvider, ttsProvider, voiceId, language
  └─ connectAgentToRoom()
       └─ sttService.transcribeStream(sttProvider)
       └─ livekitRtcService.connectAgent(onAudioChunk, onSubscribed)
            ├─ onSubscribed → speakGreeting via TTS → publishPcm
            └─ onAudioChunk (mic PCM) →
                  └─ sttStream.writeAudio(pcm)
                       └─ [VAD + endpointing]
                            └─ onUserTurnComplete(finalTranscript)
                                 └─ orchestratorService.handleUserTurn(history, tools)
                                      ├─ toolRegistry.listForPrompt(enabledTools)
                                      ├─ LLM (llmProvider) → function_calls
                                      ├─ toolExecution.execute(tool, args)
                                      └─ speakableText → ttsService.synthesize(ttsProvider, voiceId)
                                           └─ publishPcm(24kHz)
```

### PyAI Omni

```
startSession
  └─ agentToolResolver.resolve(agentId)
       → enabledTools[], toolConfigs, voiceId, language, greeting, systemPrompt
  └─ connectOmniToRoom()
       └─ omniEngine.connect(config, callbacks)
            └─ WebSocket wss://api.pyai.com/v1/omni?format=pcm16&rate=16000&api_key=...
            └─ livekitRtcService.connectAgent(onAudioChunk, onSubscribed)
                 ├─ onSubscribed → handle.start() → sends 0x03 configure frame
                 │    { event:'configure', voice_id, persona, language, greeting, tools }
                 └─ onAudioChunk (mic PCM 16kHz) → handle.writeAudio() → 0x01 frame to Omni
                      └─ Omni runs STT + VAD + LLM + TTS internally
                           ├─ 0x02 frames → streaming transcript tokens (logged only)
                           ├─ 0x01 frames → agent PCM16 24kHz → enqueuePcm → captureFrame
                           └─ 0x03 tool_call → toolExecution.execute() → 0x03 tool_result
```

### Engine Selection Fork

`voice-agent.service.ts:176` — forks on `config.engine ?? DEFAULT_AGENT_ENGINE`:
- `'omni'` → `connectOmniToRoom()`, falls back to pipeline on bring-up failure
- `'pipeline'` (default) → `connectAgentToRoom()`

---

## Tool Wiring — Both Engines

Tools work correctly across both engines. No gap here.

| Step | Pipeline | Omni |
|------|----------|------|
| Resolution | `agentToolResolver.resolve(agentId)` → `enabledTools[]` | Same |
| Schema format | `toolRegistry.listForPrompt()` → `{name, description, parameters}` | `toolRegistry.listForOmni()` → `{name, description, input_schema, execution:'client'}` |
| Execution | Orchestrator calls `toolExecution.execute()` after LLM function_call | Omni sends `tool_call` frame → `runTool()` → `toolExecution.execute()` |
| Result | Returned to LLM as function result | Sent back as `0x03 tool_result` frame |
| Config | `toolConfigs` passed to both | Same |

`execution: 'client'` in the Omni schema tells PyAI to emit `tool_call` frames instead of running tools server-side.

---

## Gaps

### 1. Voice lists are incompatible — critical

`web/src/features/agents/providers.ts` maps:
```ts
pyai: OPENAI_VOICES  // ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
```

All 6 are OpenAI-only names. PyAI Omni returns `{"detail":"voice_not_found"}` as a JSON payload on the `0x01` audio tag — no error logged, no audio plays. This is the bug that caused all the session silence issues.

**Live PyAI voice catalog**: 144 voices, fetchable via `GET /v1/voices`. Format:
```json
{
  "voice_id": "stock_sarah_style2",
  "name": "Sarah",
  "language": "en",
  "gender": "F",
  "region": "English",
  "tone": "...",
  "preview_url": "https://cdn.pyai.com/voice_previews/stock_sarah_style2.mp3"
}
```

Current languages in catalog: `de`, `en`, `en-CA`, `en-GB`, `en-US`, `en-ZA`, `es`, `fr`.

### 2. Language codes: partial mismatch

UI hard-codes 9 language options: `en`, `es`, `fr`, `de`, `pt`, `hi`, `ja`, `ko`, `zh`.

PyAI currently supports: `de`, `en`, `en-CA`, `en-GB`, `en-US`, `en-ZA`, `es`, `fr`.

**No Portuguese, Hindi, Japanese, Korean, or Chinese voices exist** in the current PyAI catalog. Selecting those in the UI sends an unsupported language code to Omni configure.

### 3. UI shows wrong voice options when engine = Omni

`VoiceTab.tsx` renders voice dropdown from `PRESET_VOICES[ttsProvider]`. If agent TTS provider is `openai`, user sees the 6 OpenAI voice names. Switching engine to Omni does not change the voice picker — invalid values persist silently.

### 4. voiceId saved without engine tag

DB stores `voiceId` as a bare string. An agent created as Pipeline with `voiceId: 'onyx'` that is later switched to Omni retains `onyx` — silently breaking audio on every call until manually fixed.

Currently fixed for `rohit-personal` (patched to `stock_sarah_style2`). Other agents not audited.

---

## Architecture Recommendation

### Engine choice should gate the entire config form

Same pattern as `ttsProvider` gating which voice dropdown appears. Engine selection drives what is shown:

```
engine = 'pipeline'                 engine = 'omni'
──────────────────────              ──────────────────────────────
STT provider picker    ✓            (hidden — Omni owns STT)
LLM provider picker    ✓            (hidden — Omni owns LLM)
TTS provider picker    ✓            (hidden — Omni owns TTS)
Voice picker           from TTS     from GET /v1/voices filtered by language
Language picker        all 9        distinct languages from GET /v1/voices
Model picker           LLM-specific (not applicable yet — model_tier is roadmap)
```

### Voice fetching: dynamic from API, not hardcoded

Add a backend proxy endpoint: `GET /agents/omni/voices`

- Calls `GET https://api.pyai.com/v1/voices` with the server-side key
- Caches result (TTL ~1 hour or process lifetime)
- Returns `{ voices: [{voice_id, name, language, gender, region, preview_url}] }`

Frontend calls this once when engine=omni config tab opens. Benefits:
- Key never exposed to browser
- New voices appear automatically without deploys
- `preview_url` enables in-picker audio preview

Languages derived on the frontend from `distinct(voices.map(v => v.language))` — no separate endpoint needed.

### Implementation checklist (not yet done)

- [ ] `GET /agents/omni/voices` proxy endpoint with 1h cache
- [ ] `VoiceTab.tsx`: when `engine === 'omni'`, fetch from proxy and render Omni voice picker (name + region + gender badges, preview button)
- [ ] `VoiceTab.tsx`: when `engine === 'omni'`, derive language options from fetched voices (not hardcoded list)
- [ ] `VoiceTab.tsx`: when `engine === 'pipeline'`, hide Omni voice UI entirely
- [ ] `providers.ts`: remove `pyai: OPENAI_VOICES` entry — it is harmful
- [ ] On agent save: warn/block if `engine === 'omni'` and `voiceId` is a known OpenAI name
- [ ] Startup check or migration: flag agents with engine=omni + OpenAI voice IDs

### Known bad voice IDs for Omni

`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` — all OpenAI TTS voices, all cause `voice_not_found` on Omni.

---

## Key File Locations

| Concern | File |
|---------|------|
| Engine fork | `src/voice-agent/voice-agent.service.ts:176` |
| Omni wire protocol | `src/voice-agent/engines/omni-engine.service.ts` |
| Tool schema for Omni | `src/orchestration/tool-registry.service.ts:58` |
| Agent config resolution | `src/agents/agents.service.ts:132` |
| AgentConfig type | `src/common/types/voice-agent.types.ts` |
| Voice/engine UI | `web/src/features/agents/components/VoiceTab.tsx` |
| Voice presets (broken for PyAI) | `web/src/features/agents/providers.ts:29` |
| Agent API schema | `web/src/lib/api/agents.ts` |
| Barge-in config | `.env` → `BARGE_IN_ENABLED=false` |

---

## Related Docs

- `docs/omni-audio-debug.md` — root cause of silence bug (wrong tags + `alloy` voice)
- `claude_handoff.md` — full session history and architectural decisions
