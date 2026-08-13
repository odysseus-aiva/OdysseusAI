# Autopilot Progress

## Completed

### Call Lifecycle Fix
- `participant_left` webhook now calls `stopSession('participant')` — calls no longer stick as `in_progress` after user disconnects. Previously relied solely on `room_finished` (5-min LiveKit timeout).

### Config Fixes
- **Barge-in default**: now `=== 'true'` (opt-in, default OFF). Original autopilot flip to default-ON was reverted — background noise triggered false VAD interrupts mid-response. `.env.example` shows `BARGE_IN_ENABLED=false`.
- **`bargeIn.minVoiceMs` default** corrected: 20000ms → 300ms (was a typo).
- **TTS default** changed from `elevenlabs` to `openai` — prevents silent agents when only OpenAI key is configured.
- `.env.example` updated to match.

### Call Lifecycle Fix (RTC path)
- `LivekitRtcService` `ParticipantDisconnected` now fires an `onParticipantDisconnected` callback wired to `stopSession('participant')`. The RTC event arrives before the webhook, so this is the reliable teardown trigger; `stopSession` is idempotent so the later webhook is a no-op.

### Agent Studio Redesign (UI)
- Agent detail page rebuilt as a 7-tab experience (Overview, Prompt, Voice, Tools, Knowledge, Variables, Advanced) with tool config in a side drawer, dirty tracking, ⌘S save.
- Agents list rebuilt as a responsive card grid with search/sort, tool counts, and a stronger empty state.
- Landing page: state-aware orb (idle/connecting/listening/thinking/speaking/error via `orb-states.ts`), agent-aware hero, cohesive VoiceConsole control, reusable StatusIndicator.
- Reusable primitives added: `Field`, `Drawer`, `Tabs`, `Section`/`Panel`/`Collapsible`/`EmptyState`.

### Real Provider Implementations
- **ElevenLabs TTS**: Real API calls to `eleven_turbo_v2`. PCM decode via ffmpeg when available.
- **Cartesia TTS**: Real `sonic-english` API via `/tts/bytes` endpoint with native PCM output (no decode needed — lowest latency provider).
- **Claude LLM**: Real Anthropic Messages API with full tool-use support (tool_use / tool_result blocks). Uses `claude-haiku-4-5-20251001` by default.

### AI Post-Call Analysis (P1-1)
- `PostCallAnalysisService` reads transcript after call ends, sends to LLM, writes `summary` + `sentiment` to call record.
- Fire-and-forget — does not block call teardown.
- `CallRecord`, Mongo schema, both repositories, and API responses updated with `analysis` field.
- **Call History list**: shows AI summary below call ID when available.
- **Call Detail page**: dedicated "AI Summary" section with summary text + sentiment badge.

### Orphan Conversation Cleanup (P0-5)
- `ConversationCleanupService` runs on 30-min interval:
  - Archives conversations with no `archivedAt` older than 4h (crash orphans).
  - Nulls `llmMessages` on conversations archived >30d (storage growth prevention).
- Both Mongo and in-memory repos implement `releaseOrphans` / `pruneArchivedMessages`.

### Dead Code
- Removed unused `latencyColor` function from `calls/page.tsx`.

### Zod Schema Fix
- `defaultProviders.stt/llm/tts` accept `null` from API (`.nullish().transform`).

---

### Analytics Dashboard (P1-6)
- `GET /call-logs/stats?period=7&agentId=` returns totalCalls, completedCalls, errorCalls, inProgressCalls, avgDurationMs, avgLatencyMs, p50/p95LatencyMs, errorRate, callsPerDay[], topTools[].
- Next.js proxy at `/api/calls/stats` with pass-through query params.
- `fetchStats()` client helper in `web/src/lib/api/calls.ts`.
- **Dashboard page**: 4-up KPI strip, call volume bar chart with hover tooltip, latency p50/p95/avg panel, top tools horizontal bars.
- **Analytics page**: period selector (7d/30d/90d), all dashboard charts plus status donut + expanded latency bars. Bar fills use `scaleX` transform (no layout thrash).
- Both pages: loading skeleton, empty state, error + retry.

---

### Cost Tracking (P1-5)
- **`CostModule`** (`src/cost/`): `CostService` in-memory per-call accumulator mirroring `PerformanceService`; `cost-rates.ts` single editable rate table keyed by model id (longest-prefix match for dated snapshots).
- **Usage capture**: LLM token usage (already returned by OpenAI/Anthropic, previously discarded) summed across the tool loop in `OrchestratorService` and surfaced via `OrchestrationTurnResult.llmUsage`; TTS chars captured at the single `speakToRoom` synth call site (covers greeting + filler + answer); STT priced from full call duration (Deepgram streams no usage).
- **Persistence**: `CallCost` type added to `CallRecord`/`CallSummary`, Mongo `call.schema.ts` `cost` prop, both repos, folded into `finalizeCall` as `finalCost` (mirrors `finalLatencyMetrics`).
- **API**: `cost` on call detail + list responses; `totalCostUsd`/`avgCostUsd` added to `/call-logs/stats`.
- **UI**: Call Detail cost breakdown (total + composition bar + per-component rows with token/char/second detail, estimated badge); Total Cost KPI on Dashboard + Analytics; Cost column in Call History list.
- Rates: LLM per-1M-token in/out, TTS per-1M-char, STT per-min. Unknown model → conservative default, flagged `estimated: true`.

---

### PyAI Hackathon — Engine Abstraction (P0-1)
- New `AgentEngine = 'pipeline' | 'omni'` (default `pipeline`), threaded through: Mongo `agent.schema.ts`, `AgentRecord`/`CreateAgentInput`/`UpdateAgentInput`/`ResolvedAgentSessionConfig`, `agents.dto.ts` (`@IsIn`), `AgentConfig`, `resolveForSession`, `AgentToolResolverService`, both agent repos (legacy docs normalize to pipeline).
- **The fork**: `VoiceAgentService.startSession` branches on `config.engine` right after config assembly. Pipeline path is byte-identical to before; `omni` throws a clean `NotImplementedException`, tears down session/perf/cost records, logs an `error` event. Verified: pipeline agent connects STT+RTC normally; omni agent fails clean; invalid engine rejected 400.
- **UI**: engine chooser on the Voice tab (Custom Pipeline / PyAI Omni cards); pipeline provider sections hidden for Omni; Overview engine tile; Agents-list engine badge + fused-engine chip.

### PyAI Hear + Speak Providers (P0-2)
- `PyAiHearProvider` (`SttProvider`, streaming WS, keep-alive + bounded reconnect + simulated fallback) and `PyAiSpeakProvider` (`TtsProvider`, `/audio/speech`, PCM with WAV-header-strip fallback, OpenAI voice aliases). Registered in `stt.service`/`tts.service` Maps + modules.
- `pyai` config block (`apiKey`, `baseUrl`); `.env.example` updated with sandbox-key bootstrap. Frontend provider lists + preset voices include `pyai`. Verified: `sttProvider:pyai` resolves the provider; no key → simulated fallback (correct offline behavior).

### First-Run Experience (P0-4)
- `AgentSeederService` (`OnApplicationBootstrap`) seeds a `Sample Assistant` pipeline agent + 4 enabled tools (datetime, weather, web_search, end_call) only when no agents exist. Idempotent — no-op the moment any agent exists. Verified on empty store + existing store.

### Omni Engine Adapter (P0-3) + Bounded Failure Handling (P0-5)
- `OmniEngineService` (`src/voice-agent/engines/`) bridges a LiveKit room to a PyAI Omni realtime WebSocket. LiveKit stays the transport (room/token/mic-in/speaker-out); Omni replaces STT→orchestrator→TTS. `connectOmniToRoom` in `VoiceAgentService` reuses `connectAgent`/`publishPcm`; mic PCM → Omni, Omni audio → room.
- **Tools across both engines**: `ToolRegistryService.listForOmni()` exposes enabled tools as Omni `configure`-frame schemas (`execution:'client'`); Omni `tool_call` frames execute through the same `ToolExecutionService` and return `tool_result`. Identical tool behavior on both engines.
- **Observability unified**: Omni transcripts mirror into the existing `stt_event` taxonomy; session lifecycle into `session_start`/`session_stop`. Call Detail renders Omni calls with no special-casing.
- **P0-5 fallback**: connect timeout (8s), bounded reconnect (2× on transient close codes 4429/1011), fatal on 4401/4403. If Omni can't be brought up, `startSession` **falls back to the pipeline** so a PyAI outage never kills the call. Verified: no key → fallback; bad key (live 401) → fallback; real key → Omni connects.
- **⚠️ Protocol — corrected twice against the live server (sandbox key WS probes):**
  - Frames are **tag-multiplexed binary**: `0x01` = PCM16 audio (both directions), `0x03` = JSON control (both directions), control keyed on `event`. Audio in = pcm16@16000, out = pcm16@24000 (from `hello`).
  - **`configure` MUST be a `0x03`-tagged binary frame.** A plain-text JSON frame is *silently dropped* — session stays unconfigured, no greeting, mic ignored. Verified: 0x03-framed configure → server replies `{"event":"configured","greeting":true}`.
  - **Greeting deferred to listener-ready** (`OmniHandle.start()` sent from `onListenerReady`), mirroring the pipeline — else turn-0 greeting plays into an empty room.
  - Confirmed live events: `hello`, `session_started`, `configured`, `idle_prompt`. Handlers for `transcript`/`turn`/`barge_in`/`tool_call`/`session_end` coded defensively (field aliases, unknown frames logged).

- **🔴 Three bugs found across two live calls, all fixed — the asymmetric audio tags were the killer:**
  1. Mic audio sent as `0x03` (control) → Omni never heard the user. Fixed → `0x01`.
  2. `configure` sent as text → silently dropped, session unconfigured. Fixed → `0x03` binary (2nd live call confirmed `{"event":"configured","voice_id":"onyx","tools":4}`).
  3. **Agent audio returns on `0x02`, not `0x01`** (seen in the 2nd live call as `unknown tag 0x2` right when the agent tried to speak). My receive handler only accepted `0x01` → dropped all agent speech. **Fixed**: receive now treats `0x03` as control and ANY other binary tag as audio.
- **Final confirmed tag scheme (asymmetric):** mic→server `0x01`; server→client audio `0x02`; control both ways `0x03`. Also handle `configured`, `idle_prompt`, `audio_position` control events.
- Greeting audio is NOT auto-emitted in headless probes (only fires after real user speech / real listener); agent `0x02` audio was observed in the live browser call. **Awaiting user re-test** with the tag fix to confirm end-to-end playback.

---

## Current Focus

**All PyAI P0 done and verified live** (P0-1 engine abstraction, P0-2 Hear+Speak providers, P0-3 Omni adapter, P0-4 first-run, P0-5 fallback). Sandbox key in `.env`; Omni connects end-to-end against `wss://api.pyai.com/v1/omni`.

---

## Open Items / Risks
- **Secret hygiene**: a real `pyai_test_` key is in `.env.example`. Not a git repo yet, but before it becomes one, move it to `.env` only and blank the example. Low severity (sandbox key).
- **`rohit-personal` agent is `engine:omni`** in Mongo (set via UI save, not by tests). Flip to pipeline if unintended.
- **Unverified Omni frames**: `transcript`/`tool_call` shapes coded from docs, not observed live (couldn't trigger speech in a text probe). Handlers accept field aliases + log unknowns; confirm with a real voice call.

## Next Priorities (P1 for the hackathon)
1. **Live Voice screen realtime state** — wire Omni + pipeline events to the orb (connecting/listening/thinking/tool/speaking/error); replace Live Calls `ComingSoon`.
2. **Call Detail engine badge** + per-engine caveats ("Omni: internal reasoning not traced").
3. **P1-7: Health check** — `GET /health` + LLM retry/backoff.
4. **Engine Compare (P2)** — same agent/prompt/tools, pipeline vs Omni side by side.

---

## Unresolved Issues

- **Auth is absent** — platform cannot be safely exposed to external users or integrations.
- **ElevenLabs PCM decode** requires `ffmpeg` on the host; falls back to raw MP3 bytes if absent (distorted audio). Alternative: use ElevenLabs PCM output format directly.
- **Single-process state** — `VoiceAgentService.sessions` Map is in-process; horizontal scaling requires Redis.
- **No recording** — no LiveKit Egress integration.
- **`CallAnalysis` unused import** in `calls/page.tsx` — `CallAnalysis` imported but only used for the type of `call.analysis`. Benign.

---

## Important Architectural Decisions

- Post-call analysis is fire-and-forget after `finalizeCall` — never blocks call teardown, never surfaces errors to the user.
- Cartesia chosen as the lowest-latency TTS option (native PCM, ~50ms TTFB); ElevenLabs for voice quality.
- Claude provider uses raw `fetch` against Anthropic API (no SDK) — avoids adding a dependency. Tool-use format maps correctly to Anthropic's `tool_use` / `tool_result` block structure.
- Cleanup service uses `setInterval` + `OnApplicationBootstrap` rather than `@nestjs/schedule` (not installed) — keeps zero new dependencies.
