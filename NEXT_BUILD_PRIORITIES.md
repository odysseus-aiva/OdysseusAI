# Next Build Priorities

_Platform state as of 2026-07-29. All P0 and P1 blueprint items from `CALL_LOGGING_ARCHITECTURE_BLUEPRINT.md` have been implemented._

---

## What Is Already Working Well

- **Full call lifecycle** — session start → per-turn pipeline → stop — is wired end-to-end with proper `endedBy` semantics for all four termination paths (participant, agent, timeout, error).
- **Event taxonomy** — 25+ distinct event types covering STT, LLM, tools, TTS, lifecycle, and performance. Events are append-only, indexed by `{callId, timestamp}` and `{callId, step}`, with a 90-day TTL.
- **Per-turn latency with p50/p95** — `PerformanceService.commitTurnLatency()` archives each turn's STT/LLM/TTS/total latency; `getFinalMetrics()` computes percentiles at session end and writes to `calls.latencyMetrics`.
- **AgentSnapshot on calls** — every call captures the agent config at start time, so historical calls remain debuggable even after the agent is edited.
- **Agent CRUD with tool assignments** — full create/read/update/delete for agents with per-agent tool enable/disable and config overrides.
- **Barge-in** — full-duplex with configurable holdoff, start holdoff, and backoff. Generation IDs prevent stale responses from publishing.
- **Tool system** — `ToolRegistryService`, `ToolExecutionService`, timeout guard, filler speech, tool result stored in conversation history. Four production-ready built-in tools: `get_weather`, `web_search`, `get_current_datetime`, `end_call`.
- **Call History list** — paginated, sortable, shows agent name (from agentSnapshot), turn count, duration, status, and latency.
- **Call Detail page** — summary card with latency pills, latency bar chart (STT/LLM/TTS/Total + p50/p95), chat-bubble transcript viewer with tool-call badges, tool execution timeline with expandable JSON, error list.
- **Metadata passthrough** — arbitrary `{key: value}` map accepted at session start, stored on `calls.metadata`, available for filtering.
- **Filter/sort on call list** — `agentId`, `status`, `startAfter`, `startBefore`, `sortBy`, `order` all supported.
- **ParticleOrb voice UI** — WebGL Three.js 90k-particle sphere with custom GLSL noise shaders. Reacts to agent state in real time via `useVoiceAssistant()`.
- **Streaming STT** — Deepgram Nova-2 with WebSocket streaming, VAD events, auto-reconnect with exponential backoff.

---

## Important Gaps

### Security and Auth (Blocker for Production)
No authentication, authorization, or API key validation exists on any endpoint. Any unauthenticated request to `POST /session/start` starts a real call consuming LLM and TTS credits. This is the single biggest gap between "working locally" and "deployable product."

### AI-Generated Call Summary
No summarization runs at session end. Users cannot scan the call list to understand what each call was about — they must drill into the raw transcript. All four leading platforms have this as a standard feature. It is the highest-value single field for call history usability.

### Cost Tracking
No STT character counts, LLM token counts, or TTS character counts are accumulated. No USD cost is computed or stored. The platform cannot show cost per call, cannot alert on expensive calls, and cannot build any billing surface.

### Analytics and Dashboard
Three pages — Dashboard, Analytics, Live Calls — are `ComingSoon` placeholders. There are no aggregation endpoints. The platform has all the raw data in MongoDB to build meaningful charts but no query surface for it.

### Real-Time Call Monitoring
There is no WebSocket gateway or Server-Sent Events endpoint. The Live Calls page cannot show active sessions. There is no way to observe a call in progress from the UI without polling.

### Recording
No audio recording is stored. There is no integration with LiveKit's recording/egress API. All four leading platforms offer call replay as a standard feature.

### Hardcoded Greeting
`VoiceAgentService.sendGreeting` always says: _"Hello! I am your voice assistant. How can I help you today?"_ This is not configurable per agent. Production agents need their own greeting, or no greeting at all.

### POC Intent Fallback in Orchestrator
`OrchestratorService` contains `shouldUseUserDetailsIntentFallback()`, marked as `TEMPORARY POC`, that synthesizes a `get_user_details` tool call when the OpenAI API key is absent and the user mentions "user details." This bypasses the real tool-calling system and will cause unexpected behavior in production.

### ElevenLabs and Cartesia TTS Stubs
Both providers are registered but always return silent PCM buffers. `DEFAULT_TTS_PROVIDER` in `.env.example` points to `elevenlabs`, meaning any deployment without an explicit override will produce a voice agent that never speaks.

### Claude LLM Stub
The Claude provider is registered but never calls the Anthropic API — it always returns a hardcoded string. Selecting Claude as the LLM provider silently degrades the agent.

### `conversations.llmMessages` Unbounded Growth
No scheduled job cleans up `llmMessages`. A long call produces a large `llmMessages` array. Over time this collection will grow significantly with no upper bound.

### No Health Checks or Circuit Breakers
No `/health` endpoint. No graceful degradation if Deepgram, Cartesia, or OpenAI are unreachable. A provider outage surfaces as a raw pipeline error.

### No Retry Logic on LLM Calls
If the LLM call fails transiently, the turn fails immediately with no retry.

### Barge-In Default Inversion Bug
In `configuration.ts`, `bargeIn.enabled` is set by `process.env.BARGE_IN_ENABLED !== 'true'`. This means the coded default is `enabled = true`. However `.env.example` sets `BARGE_IN_ENABLED=true`, which resolves to `enabled = false` (disabled). Any deployment using the example env file will have barge-in silently disabled.

### No Multi-Tenancy
All data is in a single namespace with no `tenantId` or `organizationId`. Adding it after data volume grows requires a painful migration.

### No Phone/PSTN Integration
SIP config stubs exist (`LIVEKIT_SIP_ENABLED`, trunk ID, dispatch rule ID) but nothing is wired. The platform is browser-WebRTC only.

### No Tests
Zero unit or integration test files exist. The one e2e test references `POST /voice-agent/start`, which no longer exists (moved to `POST /session/start`). It is broken.

---

## Technical Risks and Weak Areas

1. **`PerformanceService` is in-memory** — `turnLatencies[]` are lost on process restart mid-call. `getFinalMetrics()` will compute p50/p95 from zero turns for any call interrupted by a crash. Mitigation: `latency_snapshot` events are persisted so metrics can be reconstructed from the event stream if needed.

2. **No idempotency on session start** — if `voiceAgentService.startSession` throws after `livekitService.generateToken` succeeds, the LiveKit room exists but no agent connects. The frontend has tokens but hears silence with no recovery path.

3. **Single-process state** — the `sessions` Map in `VoiceAgentService` is process-local. Horizontal scaling requires Redis or a similar distributed session store.

4. **`conversations` orphan documents** — `release()` sets `archivedAt` but if the server crashes mid-call, `release()` is never called. The document stays "active" indefinitely with no cleanup job.

5. **Tool timeout is global** — `ORCHESTRATION_TOOL_TIMEOUT_MS` (default 12 s) applies to all tools equally. A `get_current_datetime` call and a `web_search` call have very different acceptable latencies.

6. **No input validation on `metadata`** — the field accepts any `Record<string, string | number | boolean>` with no size limit, key length limit, or sanitization. A malicious client could send a very large metadata object.

7. **`latencyColor` function defined but never used** — `calls/page.tsx:295` defines `latencyColor()` but it is never called anywhere in the file. Dead code.

---

## Missing Product Capabilities

| Capability | Impact | Competitors |
|---|---|---|
| Auth / API keys | Blocker | All |
| AI call summary | Very high | All |
| Configurable greeting | High | All |
| ElevenLabs TTS (real) | High | ElevenLabs |
| Cartesia TTS (real) | High | Retell, Bland |
| Claude LLM (real) | High | — |
| Cost per call | High | Retell, VAPI, Bland |
| Analytics dashboard | High | All |
| Call recording / replay | High | Retell, VAPI, Bland |
| Live call monitoring | Medium | Retell, VAPI |
| Sentiment / success eval | Medium | Retell, ElevenLabs, VAPI |
| Conversations cleanup job | Medium | — |
| Streaming transcript | Medium | Retell, ElevenLabs |
| Phone / PSTN numbers | Medium | All |
| Webhook delivery | Medium | All |
| Multi-tenancy | Medium (future) | All |
| Health checks + retries | Medium | — |
| Test coverage | Medium | — |
| Custom LLM endpoints | Low–medium | VAPI, Retell |
| Voice cloning / custom voices | Low | ElevenLabs |
| Batch/async calls | Low | Bland, VAPI |

---

## Recommended Next Steps in Priority Order

### P0 — Foundational (nothing ships to real users without these)

**P0-1: Fix the Barge-In Default Inversion**
In `src/config/configuration.ts`, change `process.env.BARGE_IN_ENABLED !== 'true'` to `process.env.BARGE_IN_ENABLED !== 'false'` so the default is enabled and can be disabled by setting `BARGE_IN_ENABLED=false`. Update `.env.example` accordingly.
- Impact: Barge-in currently silently disabled for any deployment using `.env.example`
- Effort: 5 minutes

**P0-2: Remove POC Intent Fallback**
Delete `shouldUseUserDetailsIntentFallback()` and all related code from `OrchestratorService`. Add a clear error log when no OpenAI key is present. This is a ticking silent-failure bug.
- Impact: Correctness — eliminates a class of unexplained wrong tool calls
- Effort: 30 minutes

**P0-3: Configurable Agent Greeting**
Move the hardcoded greeting string to `AgentRecord.greeting?: string` (and the MongoDB schema). If `greeting` is set, use it; if empty string, skip the greeting entirely; if `undefined`, use a default. This makes agents distinguishable from each other for end users.
- Impact: Every agent can have its own persona from the first word
- Effort: 1 hour

**P0-4: Fix ElevenLabs/Cartesia TTS Stubs**
Since `DEFAULT_TTS_PROVIDER=elevenlabs` in `.env.example` produces a silent agent, either: (a) change the default to `openai` (which is fully implemented), or (b) implement the real ElevenLabs streaming TTS. Option (a) is the safe immediate fix. Option (b) is the better long-term answer.
- Impact: Prevents deployments from silently producing a non-functional agent
- Effort: 10 minutes for default fix; 1 day for real ElevenLabs implementation

**P0-5: Conversations Orphan Cleanup Job**
Implement a `@Cron` scheduled task in `ConversationStateService` that: (1) finds conversations with no `archivedAt` whose `startedAt` is older than 4 hours and calls `release()` (orphan cleanup for crashed sessions); (2) nulls out `llmMessages` on conversations where `archivedAt` is older than 30 days.
- Impact: Prevents ghost active-session bug; prevents unbounded storage growth
- Effort: 2 hours

**P0-6: Authentication and API Key Layer**
Every endpoint must be gated. Minimum viable: API key header validation middleware in NestJS + API key stored hashed in a new `api_keys` collection. The frontend BFF passes the key from an env var. Without this, the platform cannot be exposed to any external user or integration.
- Impact: Enables any real-world usage
- Effort: 2 days

---

### P1 — Core Product Quality (needed for a credible product)

**P1-1: AI-Generated Call Summary**
After `finalizeCall`, queue an async job that reads `conversations.transcriptHistory`, sends a summarization prompt to the LLM (~150 tokens max), and writes the result to `calls.summary: string` and `calls.sentiment: 'positive'|'negative'|'neutral'`. Surface `summary` in the Call History list row (below the callId) and prominently on the Call Detail page.
- Impact: Transforms the call list from an opaque table into scannable conversation records
- Effort: 1 day (backend async job + two UI touch points)

**P1-2: Real ElevenLabs TTS Integration**
Implement `ElevenLabsTtsProvider` with real WebSocket streaming TTS. ElevenLabs supports PCM output via their streaming endpoint. Map `request.voiceId` to their voice ID format. Add a voice selector to the agent configuration UI.
- Impact: Production voice quality; ElevenLabs is the market leader for voice naturalness
- Effort: 1.5 days

**P1-3: Real Cartesia TTS Integration**
Implement `CartesiaTtsProvider` with real streaming TTS. Cartesia offers the lowest-latency TTS on the market (~50ms TTFB) which directly improves the platform's p50 response latency metric.
- Impact: Significant latency reduction; competitive with Retell/Bland on voice quality
- Effort: 1 day

**P1-4: Real Claude LLM Integration**
Implement `ClaudeLlmProvider` with actual Anthropic API calls. Map OpenAI tool-calling format to Anthropic's tool-use blocks. This unlocks Claude 3.5 Sonnet / Claude 5 Haiku as reasoning engines and removes the silent degradation when Claude is selected.
- Impact: Provider diversity; Claude models may outperform GPT-4o-mini on instruction-following
- Effort: 1 day

**P1-5: Cost Tracking**
Track LLM `usage.input_tokens + output_tokens` from OpenAI responses (already returned in the API response — just not accumulated). Track TTS character counts at synthesis time. Apply per-provider rate cards at `finalizeCall`. Write to `calls.cost: { sttUsd, llmUsd, ttsUsd, totalUsd }`. Show cost on Call Detail page.
- Impact: Enables billing, cost visibility, cost-per-agent analytics
- Effort: 1.5 days

**P1-6: Analytics Aggregation Endpoint + Dashboard Page**
Implement `GET /calls/stats?period=7d|30d|90d&agentId=` using a MongoDB aggregation pipeline returning: total calls, avg duration, avg/p50/p95 latency, error rate, calls by status, calls per day (time series), top tools used. Replace the Dashboard `ComingSoon` with real charts using the existing design system.
- Impact: Fills three currently-empty pages; gives operators visibility into platform health
- Effort: 3 days (backend 1 day, frontend 2 days)

**P1-7: Health Check and Provider Circuit Breaker**
Add `GET /health` returning MongoDB connectivity and provider reachability (Deepgram, OpenAI, ElevenLabs). Wrap LLM calls with a simple retry (2 retries, 500 ms exponential backoff). Log provider-level errors to a `providerErrors` field on `calls`.
- Impact: Ops observability; reduces call failure rate from transient provider issues
- Effort: 1 day

**P1-8: Input Validation and Size Limits**
Add size limits on `metadata` (max 20 keys, max 256 chars per value), `systemPrompt` (max 8000 chars), and `dynamicVariables`. Confirm global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` is applied.
- Impact: Prevents abuse and unexpected storage costs
- Effort: 4 hours

**P1-9: Fix the Broken E2E Test + Add Basic Test Coverage**
Fix `test/app.e2e-spec.ts` to use `POST /session/start`. Add at minimum: unit tests for `PerformanceService.commitTurnLatency`, `GuardrailService.check`, `ToolRegistryService.validateToolCall`, and `buildFilter` in the MongoDB repository.
- Impact: Regression safety net; currently zero test coverage
- Effort: 1 day

---

### P2 — Competitive Parity and Platform Maturity

**P2-1: Call Recording**
Integrate LiveKit's Egress API to start room recording at session start (when `agentConfig.recording === true`). On room finish, store the storage URL in `calls.recording.url`. Add recording playback to the Call Detail page. The `LIVEKIT_SIP_*` env stubs confirm LiveKit infra is partially anticipated.
- Impact: Call replay is expected by users familiar with Retell/VAPI/Bland
- Effort: 2 days

**P2-2: Real-Time Call Monitoring (Live Calls page)**
Add a NestJS `@WebSocketGateway` or Server-Sent Events endpoint that emits call events (`latency_snapshot`, `stt_event`, `agent_playback`) to subscribed browser clients. Replace the Live Calls `ComingSoon` page with a real-time event feed and active-session list.
- Impact: Operations team can observe and debug live calls; currently impossible
- Effort: 3 days

**P2-3: Call Success Evaluation**
Add optional `successCriteria: string` to `AgentRecord`. After call finalization, evaluate the transcript against the criteria using the LLM (alongside P1-1 summary generation — same async job, second prompt). Write `calls.analysis.callSuccessful: boolean | null` and `calls.analysis.successReason: string`. Surface in the Call Detail summary card.
- Impact: Enables quality scoring and agent performance comparison
- Effort: 1 day once P1-1 is done

**P2-4: Webhook Delivery**
Allow agents to configure a `webhookUrl`. After call finalization (and P1-1 analysis), POST a structured `call.completed` payload to that URL with the full summary, transcript, and cost. Implement retry with exponential backoff (3 attempts).
- Impact: Enables customers to push call data into their own CRM, ticketing, or analytics systems
- Effort: 2 days

**P2-5: Streaming Transcript During Live Call**
From the existing `stt_event` and orchestrator events, publish partial transcript turns to the frontend via the WebSocket gateway (P2-2). Update the Call Detail page to render a live transcript when viewing an in-progress call.
- Impact: Makes the platform feel real-time; required for call center monitoring
- Effort: 1 day once P2-2 is done

**P2-6: Multi-Tenancy Foundation**
Add `organizationId` to `agents`, `agent_tools`, and `calls`. Add a sparse index on each. Enforce `organizationId` scoping in all repository queries once auth (P0-6) provides the tenant context. This is dramatically cheaper to add before data volume grows.
- Impact: Required for SaaS; a retroactive migration will be painful
- Effort: 2 days (schema + migration + repository query updates)

**P2-7: Horizontal Scaling — Distributed Sessions**
Replace the in-process `sessions` Map in `VoiceAgentService` with a Redis-backed store, or explicitly document that the platform is single-instance only. Without this, load balancing routes some session-management requests to the wrong instance.
- Impact: Required for production scale beyond a single process
- Effort: 3 days

---

## What Should Be Avoided For Now

- **Phone/PSTN integration** — SIP stubs exist but the surface area is large: SIP trunk provisioning, number porting, carrier relationships, inbound routing rules. Not a near-term priority while the WebRTC surface is not yet production-ready.
- **Voice cloning / custom voice models** — Provider-specific, significant complexity, niche use case. ElevenLabs voice cloning requires a separate API surface not yet needed.
- **Batch/async calls** — Requires a job queue (BullMQ or similar), async result webhooks, and a different session model. Better after the synchronous path is solid.
- **Per-call custom LLM endpoint URLs** — Allowing arbitrary per-call endpoint URLs introduces SSRF security risks. Per-agent provider selection (already implemented) is sufficient.
- **Streaming LLM tokens to TTS** — Token-by-token streaming from LLM to TTS (sentence-level chunking) is a meaningful latency improvement but requires significant orchestrator restructuring. Worth a dedicated architectural spike, not a quick add.
- **Frontend i18n** — Not needed until multi-region or multi-language customer support is a requirement.
- **Orchestrator cognitive complexity refactor** — `OrchestratorService.handleUserTurn` is high complexity but correct. Refactor only when adding new orchestration features naturally decompose it.

---

## Dependency Map

```
P0-6 (Auth)
    └─→ P2-2 (WebSocket auth)
    └─→ P2-4 (Webhook, tenant context)
    └─→ P2-6 (Multi-tenancy, needs tenant from auth)

P1-1 (AI Summary)
    └─→ P2-3 (Success eval reuses same async job)
    └─→ P2-4 (Webhook payload includes summary)

P1-2/P1-3 (ElevenLabs/Cartesia TTS)
    └─→ P2-1 (Recording makes more sense with real voices)

P1-5 (Cost tracking)
    └─→ P1-6 (Cost charts in analytics)
    └─→ P2-4 (Webhook payload includes cost)

P2-2 (WebSocket gateway)
    └─→ P2-5 (Streaming transcript)
```

---

## Expected Impact Summary

| Item | Effort | User Impact | Ops Impact |
|---|---|---|---|
| P0-1 Barge-in default fix | 5 min | High (barge-in silently broken) | Low |
| P0-2 Remove POC fallback | 30 min | Bug fix (silent wrong behavior) | Correctness |
| P0-3 Configurable greeting | 1 h | High (agent persona) | Low |
| P0-4 Fix TTS default | 10 min | Critical (silent agent) | Low |
| P0-5 Conversations cleanup job | 2 h | Low | High (storage/reliability) |
| P0-6 Auth / API keys | 2 d | Critical (enables deployment) | Critical |
| P1-1 AI call summary | 1 d | Very high (call list UX) | Medium |
| P1-2 ElevenLabs TTS (real) | 1.5 d | High (voice quality) | Medium |
| P1-3 Cartesia TTS (real) | 1 d | High (latency reduction) | Medium |
| P1-4 Claude LLM (real) | 1 d | Medium (provider diversity) | Low |
| P1-5 Cost tracking | 1.5 d | High (billing/visibility) | High |
| P1-6 Analytics dashboard | 3 d | High (3 live pages) | High |
| P1-7 Health + retries | 1 d | Medium (reliability) | High |
| P1-8 Input validation | 4 h | Low | High (abuse prevention) |
| P1-9 Fix tests + coverage | 1 d | None | High (regression safety) |
| P2-1 Call recording | 2 d | High (expected feature) | Medium |
| P2-2 Live monitoring | 3 d | Medium | High |
| P2-3 Success evaluation | 1 d | Medium | Medium |
| P2-4 Webhook delivery | 2 d | High (integrations) | Medium |
| P2-5 Streaming transcript | 1 d | Medium | Low |
| P2-6 Multi-tenancy | 2 d | Low now, critical later | High |
| P2-7 Horizontal scaling | 3 d | Low now, critical later | High |
