# Call Logging Readiness Analysis

> Pre-implementation audit of the current backend logging and MongoDB persistence
> before building a Call History / Logs UI. Analysis only — no code changes.

---

## 1. What Is Already In Place

### Data model overview

Three MongoDB collections are in play:

| Collection       | Purpose                                                              | Keyed by           |
| ---------------- | -------------------------------------------------------------------- | ------------------ |
| `calls`          | Top-level call record: room, participant, latency metrics, errors.   | `callId`, `roomName` |
| `call_events`    | Time-ordered stream of all pipeline events during a call.            | `eventId`, `callId` |
| `conversations`  | Full conversation state: transcript history, LLM messages, tool history, system prompt, config. | `callId` |

### Event types already emitted

The following `CallLogStep` values are written to `call_events` today:

| Category          | Steps                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| Lifecycle         | `session_start`, `session_stop`, `participant_joined`, `participant_left`        |
| STT               | `stt_event` (interim + final transcripts, speech_start/end)                     |
| Turn detection    | `turn_decision`                                                                  |
| Orchestration     | `orchestration_start`, `prompt_built`, `llm_response`, `response_planned`, `guardrail_check`, `orchestration_complete`, `orchestration_error` |
| Tool execution    | `tool_call`, `tool_result`                                                       |
| TTS               | `tts_start`, `tts_complete`                                                      |
| Audio playback    | `agent_playback`, `agent_interrupted`                                            |
| Performance       | `performance`                                                                    |
| Webhooks          | `webhook`                                                                        |
| Errors            | `error`                                                                          |

### What is stored in the `conversations` collection

- Full `transcriptHistory` (`[{role, text, timestamp}]`) — every user + agent turn.
- Full `llmMessages` array (system prompt + all turns in OpenAI format).
- `toolCallHistory` — per-tool: `name`, `input`, `output`, `error`, `success`, `timestamp`.
- `systemPrompt`, `llmProvider`, `agentId`, `enabledTools`.
- `lastUserUtterance`, `lastAgentResponse`.
- `startedAt`, `updatedAt`, `archivedAt`.

### What is stored in `calls`

- `callId`, `roomName`, `participantId`, `agentId`.
- `latencyMetrics` (timestamp-based milestones: STT, LLM start/end, TTS, playback).
- `callErrors` (string array), `createdAt`, `updatedAt`.

### Existing query surface

| Endpoint                           | Returns                                   |
| ---------------------------------- | ----------------------------------------- |
| `GET /call-logs/:callId`           | Full single call record + events + latency |
| `GET /voice-agent/session/:roomName` | Session status + logs + performance       |
| `CallLogsRepository.listAll()`     | All calls (exists, **not exposed via HTTP**) |

---

## 2. What Is Missing or Insufficient

### 2.1 No list endpoint for call history

`listAll()` exists in the repository but **there is no HTTP route** (`GET /calls`) that exposes it. The Call History UI cannot display a call list without this. This is the single most critical blocker.

Additionally, `listAll()` in `MongoCallLogsRepository` does N+1 queries (one per call to load events). For a list view this is expensive and unnecessary — the list only needs summary data from `calls`, not all events.

### 2.2 No call duration stored

`calls.createdAt` and `calls.updatedAt` exist, but there is **no `endedAt` field** and no **`durationMs` computed value** written at session stop. Leading platforms (Retell, VAPI, Bland, ElevenLabs) all surface duration as a primary list column. Currently duration must be approximated as `updatedAt - createdAt`, which is imprecise because `updatedAt` is touched by every log event.

### 2.3 No call status / outcome field

There is no `status` field on `CallRecord` or `CallEntity` beyond the presence of errors. A UI needs to know whether a call was `completed`, `in_progress`, `error`, or `ended_by_agent` / `ended_by_user`. This is a first-class field on every leading platform.

### 2.4 No `endedBy` or termination reason

There is no record of what caused a call to end: user disconnected, agent ended it via the `end_call` tool, room timeout, error, etc. VAPI, Retell, and Bland all return a `disconnection_reason` or `call_ended_by` field.

### 2.5 Conversation transcript not queryable from call history

The full transcript lives in `conversations.transcriptHistory`, but `call_events` only has raw `stt_event` data, not clean human-readable transcript entries. To render a transcript on the call detail page, the UI needs to join `conversations` by `callId` — but this join does not exist on any current HTTP endpoint.

### 2.6 No call summary or AI analysis

Retell, VAPI, Bland, and ElevenLabs all populate a `call_summary` / `transcript_summary` on the call record at session end. Currently no summarization runs at session stop. A call history table without summaries requires drilling into raw transcripts to understand what the call was about.

### 2.7 No user sentiment or call outcome scoring

ElevenLabs returns `call_successful` + `sentiment_analysis`. Retell returns `user_sentiment`. VAPI returns `analysis.summary`, `analysis.successEvaluation`. We have none. Not critical for Phase 1 but expected by users familiar with these platforms.

### 2.8 Latency metrics not persisted reliably

`PerformanceService` uses an **in-memory map** keyed by `callId`. Metrics are only flushed to MongoDB via `updateLatencyMetrics` after TTS completes — on a per-turn basis. If the server restarts mid-call, or if the call ends without a turn completing, metrics are lost. The intermediate milestones (`llmStart`, `ttsEnd`, etc.) also store absolute epoch timestamps, not computed durations, so downstream consumers must subtract them.

### 2.9 Tool execution latency not captured

`tool_call` and `tool_result` events are logged, but neither has a `latencyMs` field. There is no per-tool duration in `ToolCallHistoryEntry`. Retell tracks this under `latency.s2s` (speech to speech). For a tool-execution timeline in the UI, per-tool timing is essential.

### 2.10 No `agentId` on `CallRecord` (model layer)

`CallEntity` has an `agentId` column and `ConversationEntity` stores it, but `CallRecord` (the in-memory DTO) and `createCallRecord` factory have no `agentId` field. The agent config that started the session is never written to `calls`. If a user ran multiple agent configurations, there is no way to filter the call list by agent.

### 2.11 Transcript stored twice, inconsistently

- `conversations.transcriptHistory` holds structured `[{role, text, timestamp}]`.
- `call_events` holds `stt_event` entries containing raw `SttEvent` objects (interim + final + speech boundaries), plus `llm_response` entries with the agent's text.

There is no single, clean, turn-level transcript record. The `transcriptHistory` in `conversations` is the canonical version, but it is not surfaced on any public API endpoint.

### 2.12 `turn_decision` is overloaded as an event type

`turn_decision` is emitted for: actual turn-end decisions, `agent_speech_start`, and `agent_speech_end` markers from `publishAudioToRoom`. These are semantically different events sharing the same step name, making timeline reconstruction unreliable.

### 2.13 `performance` step creates redundant log entries

The `performance` step is appended to `call_events` after every TTS completion, duplicating data already stored in `calls.latencyMetrics`. Downstream consumers get the same metrics twice in different shapes.

### 2.14 `listAll()` has an N+1 query problem

`MongoCallLogsRepository.listAll()` fetches all calls then calls `findByCallId()` for each — loading every event for every call. For a history list view this is O(n × events_per_call). It will not scale past ~50 calls without becoming slow.

---

## 3. Identifier Consistency Audit

| Identifier        | Where created              | Stored on `calls` | Stored on `call_events` | Stored on `conversations` | Consistent? |
| ----------------- | -------------------------- | ----------------- | ----------------------- | ------------------------- | ----------- |
| `callId`          | `SessionService.startSession` (uuid) | ✅ | ✅ (indexed) | ✅ (indexed) | ✅ |
| `roomName`        | `SessionService` as `voice-${callId}` | ✅ | as `roomId` ⚠️ | ✅ | ⚠️ column name differs |
| `participantId`   | Set on participant_joined, async | ✅ (nullable) | ✅ (nullable) | ✅ (nullable) | ✅ |
| `agentId`         | Optional on `AgentConfig`  | ✅ (nullable on schema, **missing from DTO/factory**) | ❌ not emitted | ✅ | ❌ not written to calls |
| `eventId`         | `call-record.factory.createLogEntry` (uuid) | — | ✅ | — | ✅ |

**Key discrepancy:** `roomName` is stored as `roomId` on `CallLogEntry` / `call_events`. The field name differs between the two collections even though the value is the same string. This causes confusion when joining.

---

## 4. MongoDB Schema Assessment for a Call History UI

### What works well

- Separate `calls` (summary) + `call_events` (detail) split is correct for a list/detail UI pattern. The list query only needs `calls`; detail expands to `call_events`.
- `call_events` has composite indexes `{callId, timestamp}` and `{callId, step}` — good for both chronological timeline and step-filtered queries.
- `calls.createdAt` has a descending index — good for default sort in the list.
- `conversations` is fully separated, keyed by `callId` — cleanly joinable.

### What needs to change

1. **`calls` needs `status`, `endedAt`, `durationMs`, `endedBy`** — these are the primary list-view columns. Without them the table is not renderable.
2. **`calls` needs `agentId`** propagated from `AgentConfig`.
3. **`CallRecord` DTO needs to match `CallEntity`** — `agentId` is on the schema but not the DTO or factory, causing a silent gap.
4. **The `listAll()` method must not load events** — a summary query should select only `calls` fields.
5. **`conversations` needs to be exposed** via a joined API endpoint (e.g. `GET /calls/:callId/transcript`) so the transcript is accessible without reading raw `stt_event` entries.
6. **Pagination on the list endpoint is required** from day one — an unbound list of all calls will be slow and wasteful even with a limit of 100.

---

## 5. How Leading Platforms Structure Call History

### Common list-view columns (all four platforms)

| Column               | Retell | VAPI | Bland | ElevenLabs |
| -------------------- | ------ | ---- | ----- | ----------- |
| Call ID              | ✅ | ✅ | ✅ | ✅ |
| Agent / Assistant    | ✅ | ✅ | ✅ | ✅ |
| Start time           | ✅ | ✅ | ✅ | ✅ |
| Duration             | ✅ | ✅ | ✅ | ✅ |
| Status / outcome     | ✅ | ✅ | ✅ | ✅ |
| Ended by / reason    | ✅ | ✅ | ✅ | ✅ |
| Transcript summary   | ✅ | ✅ | — | ✅ |
| Sentiment            | ✅ | — | — | ✅ |
| Call success score   | ✅ | ✅ | — | ✅ |
| Recording            | ✅ | ✅ | ✅ | — |
| Cost                 | ✅ | ✅ | ✅ | — |
| Tools used           | — | ✅ | — | ✅ |
| Latency (p50/p95)    | ✅ | — | — | — |

### Common detail-view sections (all four platforms)

1. **Summary bar** — duration, outcome, agent, start/end timestamps.
2. **Transcript** — clean turn-by-turn conversation, speaker-labeled, with timestamps.
3. **Latency breakdown** — STT / LLM / TTS per-turn or aggregate.
4. **Tool execution timeline** — which tools fired, arguments, results, timing.
5. **Call analysis** — AI-generated summary, success evaluation, sentiment.
6. **Metadata / variables** — dynamic variables set at call start.
7. **Recording** (VAPI, Retell, Bland) — audio playback.

### Key UX patterns observed

- The list is always sortable by `startTime` and `duration`.
- Status uses a colored badge: green = success, red = error/failed, yellow = in-progress.
- Transcripts are rendered turn-by-turn, not as a raw text block.
- Tool calls are shown inline in the transcript at the point where they fired.
- Latency is shown as computed durations (e.g. "STT: 420ms, LLM: 1.2s, TTS: 340ms"), not raw epoch timestamps.

---

## 6. What Should Be Fixed Before Building the UI

### Mandatory (UI is not functional without these)

1. **Add `status`, `endedAt`, `durationMs`, and `endedBy` to `CallEntity` and `CallRecord`.**
   Written at `session_stop`. Without these, the list table has no status column and no duration column.

2. **Expose `GET /calls` HTTP endpoint** with pagination (`page`/`limit` or cursor), returning summary rows only from `calls` — no event loading.

3. **Fix `listAll()` to be a summary query** — SELECT only `calls` fields, no events join.

4. **Add `agentId` to `CallRecord` DTO and `createCallRecord` factory.** The field is on the schema but silently dropped in the application layer.

5. **Expose `GET /calls/:callId/transcript`** that returns `conversations.transcriptHistory` — clean `[{role, text, timestamp}]` — for the detail transcript panel.

6. **Write `endedAt` and `durationMs` at session stop** in `VoiceAgentService.stopSession`.

### High Priority (significantly degrades UX without these)

7. **Compute and store per-segment latency durations** (`sttLatencyMs`, `llmLatencyMs`, `ttsLatencyMs`) at turn completion instead of storing raw epoch timestamps. The UI should show "LLM: 1.2s", not milliseconds-since-epoch.

8. **Fix `turn_decision` event overloading** — introduce `agent_speech_start` and `agent_speech_end` as distinct `CallLogStep` values. Currently `turn_decision` is used for three semantically different purposes.

9. **Add `latencyMs` to tool events** — track `tool_call` start time and write duration on `tool_result`. Required for a tool execution timeline.

10. **Normalize `roomId` field name to `roomName`** across `CallLogEntry` and `call_events`. The inconsistency between `roomName` (on `calls`) and `roomId` (on `call_events`) is confusing and will cause bugs in joined queries.

### Improvements (nice to have before or shortly after launch)

11. **Add a call summary / headline** — a short AI-generated description of what was discussed, written to `calls.summary` at `session_stop`. This is the single highest-value field for navigating a call list; all four leading platforms have it.

12. **Remove the redundant `performance` step from `call_events`** — latency is already in `calls.latencyMetrics`. The `performance` step duplicates it and adds noise to the timeline.

13. **Paginate `GET /call-logs/:callId` events** — calls with many turns can produce hundreds of events. Add `?steps=stt_event,llm_response` query param filtering and cursor pagination.

14. **Add `messageCount` / `turnCount` to `calls`** — allows the list view to show "8 turns" without loading events.

---

## 7. Prioritized Change List

### P0 — Blockers (call history list is non-renderable without these)

| # | Change | Location |
|---|--------|----------|
| 1 | Add `status`, `endedAt`, `durationMs`, `endedBy` to `CallEntity`, `CallRecord`, and factory | `schemas/call.schema.ts`, `call-log.types.ts`, `call-record.factory.ts` |
| 2 | Write `endedAt`, `durationMs`, `status=completed/error` at session stop | `VoiceAgentService.stopSession` |
| 3 | Expose `GET /calls` with pagination (summary rows, no events) | New `CallsController` or extend `CallLogsController` |
| 4 | Fix `listAll()` to avoid N+1 — return summary from `calls` only | `MongoCallLogsRepository` |

### P1 — Required for a usable detail view

| # | Change | Location |
|---|--------|----------|
| 5 | Add `agentId` to `CallRecord` DTO and factory | `call-log.types.ts`, `call-record.factory.ts` |
| 6 | Expose `GET /calls/:callId/transcript` returning `conversations.transcriptHistory` | New endpoint in `CallLogsController` or `SessionController` |
| 7 | Compute `sttLatencyMs`, `llmLatencyMs`, `ttsLatencyMs` as durations, store on `calls` | `VoiceAgentService.processUserUtterance`, `PerformanceService` |
| 8 | Add `latencyMs` to `tool_call`/`tool_result` events | `ToolExecutionService` |

### P2 — Quality and consistency

| # | Change | Location |
|---|--------|----------|
| 9  | Rename `roomId` → `roomName` on `CallLogEntry` and `call_events` | `call-log.types.ts`, `CallEventEntity`, all callsites |
| 10 | Split `turn_decision` into `agent_speech_start` / `agent_speech_end` step types | `CallLogStep`, `VoiceAgentService.publishAudioToRoom` |
| 11 | Remove `performance` step from `call_events` (latency is already in `calls`) | `VoiceAgentService.processUserUtterance` |

### P3 — Premium UX (after initial UI ships)

| # | Change | Location |
|---|--------|----------|
| 12 | Add `summary` field to `CallEntity` — write at session stop (LLM-generated or last agent turn) | `calls` schema, `VoiceAgentService.stopSession` |
| 13 | Add `turnCount` to `calls` — increment per `agent_playback` event | `CallEntity` |
| 14 | Add cursor pagination to `GET /call-logs/:callId` with step-type filtering | `CallLogsController` |
| 15 | Surface `call_analysis` (outcome: success/failure/unknown) via agent utterance or rule | New field on `CallEntity` |

---

## 8. Summary Assessment

The foundation is solid: the three-collection schema is well-designed, events are rich and granular, and the orchestration pipeline logs faithfully. However, the data is missing the few fields that every call history UI requires as its first page load: a status, a duration, a way to list calls, and a clean transcript endpoint. These are four surgical additions, not a redesign.

The most important immediate fix before starting the UI is **P0** — four changes concentrated in the schema, factory, stop handler, and list query. Everything else in P1/P2 is additive and can be done in parallel with early UI work.

The transcript story is especially important: it already exists in full in `conversations.transcriptHistory`. It just needs an API endpoint. This is one of the highest-value, lowest-effort changes available.
