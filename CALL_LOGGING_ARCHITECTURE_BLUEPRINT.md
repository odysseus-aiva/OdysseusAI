# Call Logging Architecture Blueprint

> Production-grade logging and persistence design for the OdysseusAI voice agent platform.
> Analysis only — no code changes in this document.
> Current state reflects the codebase as of 2026-07-30.

---

## Table of Contents

1. [Accurate Current State](#1-accurate-current-state)
2. [Platform Comparison](#2-platform-comparison)
3. [Gap Analysis](#3-gap-analysis)
4. [Recommended MongoDB Architecture](#4-recommended-mongodb-architecture)
5. [Schema Changes Required](#5-schema-changes-required)
6. [Logging Improvements](#6-logging-improvements)
7. [Missing Events and Metrics](#7-missing-events-and-metrics)
8. [API Changes Required](#8-api-changes-required)
9. [UI: Current State and Missing Pieces](#9-ui-current-state-and-missing-pieces)
10. [Prioritized Implementation Plan](#10-prioritized-implementation-plan)

---

## 1. Accurate Current State

> Note: The earlier `CALL_LOGGING_READINESS_ANALYSIS.md` reflected a pre-implementation snapshot. The codebase has since progressed significantly. This section describes what is actually in place today.

### 1.1 MongoDB Collections (5 total)

| Collection     | Purpose                                                                 | Key Indexes                                          |
|----------------|-------------------------------------------------------------------------|------------------------------------------------------|
| `calls`        | Summary record per call. One doc per call, never grows.                 | `callId` (unique), `agentId`, `status`, `{createdAt:-1}`, `{status,createdAt}` |
| `call_events`  | Append-only event stream. Potentially hundreds of docs per call.        | `eventId` (unique), `{callId,timestamp}`, `{callId,step}` |
| `conversations`| Live conversation state: transcript, LLM messages, tool history, agent config. Archived at call end. | `callId` (unique), `roomName`, `archivedAt` |
| `agents`       | Named agent configurations.                                             | `agentId` (unique)                                   |
| `agent_tools`  | Agent-to-tool assignments with per-agent config.                        | `agentId`, `{agentId,toolName}` (unique)             |

### 1.2 Call Lifecycle (already fully wired)

```
SessionService.startSession()
  → generates callId, roomName
  → VoiceAgentService.startSession() [fire-and-forget]
      → CallLogsService.initCall()          writes calls{callId, status:'in_progress', createdAt}
      → logs session_start event
      → connectAgentToRoom() → greeting → status:'listening'
      ↓
  Per turn: processUserUtterance()
      → OrchestratorService.handleUserTurn()
          → logs orchestration_start, prompt_built, llm_response
          → ToolExecutionService: logs tool_call, tool_result (with latencyMs)
          → logs response_planned, guardrail_check, orchestration_complete
      → PerformanceService records milestones [IN-MEMORY]
      → CallLogsService.updateLatencyMetrics() flushes aggregate latency to calls
      ↓
  End triggers: participant DELETE /session, end_call tool, room_finished webhook, error
      → VoiceAgentService.stopSession(roomName, endedBy)
          → ConversationStateService.release()  sets archivedAt on conversations
          → logs session_stop event
          → CallLogsService.finalizeCall()      writes status, endedBy, endedAt, durationMs
```

### 1.3 Existing `calls` Fields

```
callId          string (uuid)
roomName        string
participantId   string | null
agentId         string | null         ← written from AgentConfig
status          'in_progress' | 'completed' | 'error'
endedBy         'participant' | 'agent' | 'timeout' | 'error' | 'unknown'
endedAt         number (epoch ms)
durationMs      number
latencyMetrics  {
  sttLatencyMs, llmLatencyMs, ttsLatencyMs,
  totalResponseLatencyMs               ← aggregate (last turn only — see gap §3.3)
}
callErrors      string[]
createdAt       number (epoch ms)
updatedAt       number (epoch ms)
```

### 1.4 Existing API Surface

| Endpoint                              | Status        | Notes                                              |
|---------------------------------------|---------------|----------------------------------------------------|
| `POST /session/start`                 | ✅ Implemented |                                                    |
| `DELETE /session/:roomName`           | ✅ Implemented |                                                    |
| `GET /call-logs?limit&offset`         | ✅ Implemented | Paginated summary list, max 200/page               |
| `GET /call-logs/:callId`              | ✅ Implemented | Full record + all events                           |
| `GET /call-logs/:callId/transcript`   | ✅ Implemented | Returns `conversations.transcriptHistory`          |
| `GET /voice-agent/session/:roomName`  | ✅ Implemented | Live session status + logs + performance           |
| `GET /agents`, `POST /agents`, etc.   | ✅ Implemented | Full CRUD                                          |
| Analytics / Dashboard endpoints       | ❌ Missing     | Frontend pages are `ComingSoon` placeholders       |

### 1.5 What the Frontend Actually Renders Today

**Call History list** (`/calls`):
- Columns: Call ID (truncated), Status badge, Duration, Total response latency (color-coded), Started (relative)
- Pagination: 50/page, prev/next
- No agent name, no summary, no turn count, no end reason

**Call Detail** (`/calls/:callId`): **Page does not exist yet.** The backend endpoint and BFF proxy are wired; the frontend page is not implemented.

**Analytics / Dashboard / Live Calls**: All `ComingSoon` placeholder pages.

---

## 2. Platform Comparison

### 2.1 Call Record Fields — Leading Platforms vs Ours

| Field                        | Retell | VAPI   | Bland  | ElevenLabs | Ours (Today) |
|------------------------------|--------|--------|--------|------------|--------------|
| Call ID                      | ✅     | ✅     | ✅     | ✅         | ✅           |
| Agent / Assistant name       | ✅     | ✅     | ✅     | ✅         | ID only      |
| Agent config snapshot        | ✅     | ✅     | —      | ✅         | ❌           |
| Start time                   | ✅     | ✅     | ✅     | ✅         | ✅           |
| End time                     | ✅     | ✅     | ✅     | ✅         | ✅           |
| Duration                     | ✅     | ✅     | ✅     | ✅         | ✅           |
| Status / outcome             | ✅     | ✅     | ✅     | ✅         | ✅           |
| Ended by / disconnect reason | ✅     | ✅     | ✅     | ✅         | ✅ (basic)   |
| Call type (web/phone)        | ✅     | ✅     | ✅     | —          | ❌           |
| Transcript (clean)           | ✅     | ✅     | ✅     | ✅         | ✅ (via API) |
| Transcript summary (AI)      | ✅     | ✅     | ✅     | ✅         | ❌           |
| Per-turn latency             | ✅     | —      | —      | ✅         | ❌           |
| Aggregate latency (p50/p95)  | ✅     | —      | —      | —          | ❌           |
| User sentiment               | ✅     | —      | —      | ✅         | ❌           |
| Call success evaluation      | ✅     | ✅     | —      | ✅         | ❌           |
| Tool execution timeline      | ✅     | ✅     | —      | ✅         | ✅ (events)  |
| Per-tool latency             | ✅     | ✅     | —      | ✅         | ✅ (latencyMs on tool_result) |
| Cost breakdown               | ✅     | ✅     | ✅     | ✅         | ❌           |
| Recording URL                | ✅     | ✅     | ✅     | ✅         | ❌           |
| Custom metadata              | ✅     | ✅     | ✅     | ✅         | ❌           |
| Dynamic variables            | ✅     | ✅     | ✅     | ✅         | ❌           |
| Turn count                   | ✅     | ✅     | —      | ✅         | ❌           |
| Word count                   | —      | —      | ✅     | ✅         | ❌           |

### 2.2 Transcript Model Comparison

**Retell** stores transcripts as an array of objects with word-level timing:
```json
{
  "role": "agent",
  "content": "Hello! How can I help you today?",
  "words": [
    { "word": "Hello", "start": 0.0, "end": 0.3 },
    { "word": "How", "start": 0.4, "end": 0.6 }
  ]
}
```

**VAPI** stores both a flat `transcript` string and a `messages` array in the artifact:
```json
{
  "role": "bot",
  "message": "Hello! How can I help?",
  "time": 1234567890,
  "endTime": 1234567893,
  "secondsFromStart": 2.4,
  "duration": 3.2
}
```

**ElevenLabs** includes per-turn conversation metrics:
```json
{
  "role": "agent",
  "message": "Hello! How can I help?",
  "time_in_call_secs": 2.4,
  "end_time_in_call_secs": 5.6,
  "conversation_turn_metrics": {
    "latency": { "elapsed": 0.84 },
    "usage": { "model": "gpt-4o-mini", "input_tokens": 450, "output_tokens": 22 }
  }
}
```

**Ours today**: `[{role, text, timestamp}]` — clean but no timing, no latency, no token counts.

### 2.3 Latency Model Comparison

**Retell** stores per-call p50/p95/p99 latency breakdown:
```json
"latency": {
  "e2e": { "p50": 1240, "p95": 2100, "p99": 3200 },
  "llm": { "p50": 820, "p95": 1400 },
  "tts": { "p50": 280, "p95": 540 },
  "s2s": { "p50": 1050, "p95": 1800 }
}
```

**ElevenLabs** stores latency at the turn level in the transcript array (see above).

**Ours today**: Stores raw epoch timestamps for STT/LLM/TTS milestones from the last turn only, computed into `sttLatencyMs`, `llmLatencyMs`, `ttsLatencyMs`, `totalResponseLatencyMs`. Cross-turn aggregates (p50/p95) are never computed. Intermediate milestones are lost on server restart.

### 2.4 Cost Model (Not Present in Ours)

All four platforms surface cost at the call level, broken down by component:

| Cost Component     | Retell | VAPI   | Bland  | ElevenLabs |
|--------------------|--------|--------|--------|------------|
| STT cost / chars   | ✅     | ✅     | ✅     | —          |
| LLM cost / tokens  | ✅     | ✅     | —      | ✅         |
| TTS cost / chars   | ✅     | ✅     | ✅     | ✅         |
| Total cost USD     | ✅     | ✅     | ✅     | ✅         |

### 2.5 Analysis / Intelligence Model

**VAPI** runs analysis at call end and writes:
```json
"analysis": {
  "summary": "User called to check order status. Agent confirmed shipment.",
  "successEvaluation": "true",
  "structuredData": { "orderNumber": "12345", "resolved": true }
}
```

**Retell** includes:
```json
"call_analysis": {
  "call_summary": "User inquired about billing...",
  "in_voicemail": false,
  "user_sentiment": "Positive",
  "call_successful": true,
  "custom_analysis_data": {}
}
```

**ElevenLabs** includes:
```json
"analysis": {
  "call_successful": "success",
  "transcript_summary": "The agent helped the user reset their password.",
  "evaluation_criteria_results": {},
  "data_collection_results": {}
}
```

**Ours today**: No analysis whatsoever. The call record has no summary, sentiment, or success evaluation.

---

## 3. Gap Analysis

### 3.1 Critical Data Gaps

#### G1 — No Agent Config Snapshot
`calls.agentId` stores the agent's ID but not its configuration at the time of the call. If an agent's system prompt is updated, all historical calls lose their context: you cannot know what prompt or voice or tools were actually active during a historical call. All four leading platforms embed a snapshot of the agent/assistant config in the call record.

**Impact**: Debugging failed calls is impossible if the agent was subsequently modified. Historical analytics become meaningless.

#### G2 — No Per-Turn Latency History
`latencyMetrics` on `calls` stores aggregate values from the last completed turn only. No per-turn latency is preserved. A call with 10 turns where turn 3 had an 8-second LLM response looks identical to one where all turns were fast.

**Impact**: Cannot identify which specific turn caused a latency spike. Cannot compute true p50/p95 across a call.

#### G3 — No Cost Tracking
No STT character counts, LLM token counts (input/output), or TTS character counts are tracked. No USD cost is computed or stored.

**Impact**: Cannot show cost per call in the UI. Cannot build cost analytics. Cannot alert on high-cost calls.

#### G4 — No Call Summary / AI Analysis
No AI-generated summary, sentiment, or success evaluation is produced at session end.

**Impact**: Call history list is not navigable — users must drill into full transcripts to understand what any call was about.

#### G5 — No Custom Metadata / Dynamic Variables
There is no way to pass arbitrary key-value pairs (user ID, account number, session context, A/B test variant) at call start and have them preserved on the call record.

**Impact**: Cannot correlate calls with users in your own system. Cannot segment analytics by custom dimensions.

#### G6 — No Recording Support
No audio recording URL is stored or surfaced.

**Impact**: Cannot replay calls. Standard expectation for all voice platforms.

#### G7 — No Turn Count on `calls`
`calls` has no `turnCount` field. Computing it requires aggregating `call_events`.

**Impact**: The call history list cannot show "8 turns" without an expensive query.

### 3.2 Data Quality Issues

#### G8 — `latencyMetrics` Stores Last-Turn Data Only
`PerformanceService.updateLatencyMetrics()` is called after each TTS completion and overwrites the existing `latencyMetrics` map on `calls`. The previous turn's values are discarded. The field name `latencyMetrics` implies aggregate statistics but contains point-in-time data from the most recent turn.

#### G9 — `PerformanceService` is Fully In-Memory
All latency milestones live in a `Map<callId, milestones>`. On server restart or pod eviction, all in-flight call metrics are permanently lost. The metrics are only durable after each TTS completes.

#### G10 — `roomId` / `roomName` Naming Inconsistency
`CallLogEntry` (and therefore `call_events` documents) stores the room identifier as `roomId`. The `calls` collection stores it as `roomName`. These are the same string value under different keys, causing cognitive overhead and potential join bugs.

#### G11 — `turn_decision` Event Overloading
The `turn_decision` step is emitted for three semantically different purposes:
1. Actual end-of-turn decisions (VAD / silence timer)
2. `agent_speech_start` markers from `publishAudioToRoom`
3. `agent_speech_end` markers from `publishAudioToRoom`

This makes timeline reconstruction unreliable: a consumer filtering for `step = 'turn_decision'` gets three types of events interleaved.

#### G12 — `performance` Step Duplicates `calls.latencyMetrics`
After every TTS completion, a `performance` event is written to `call_events` containing the same latency values already stored in `calls.latencyMetrics`. The timeline view gets polluted with non-conversational entries.

#### G13 — Transcript Stored Twice in Different Shapes
- `conversations.transcriptHistory` — structured `{role, text, timestamp}` array (canonical, clean)
- `call_events` — raw `stt_event` entries (interim + final) and `llm_response` entries (agent text)

These serve different purposes but there is no explicit statement of which is canonical and why both exist. The `llmMessages` array in `conversations` is a third copy of the conversation in OpenAI wire format.

#### G14 — No TTL Strategy
There are no TTL indexes anywhere in the codebase. `call_events` documents will grow unbounded. A call with many tool-using turns can produce 50–100 events. At 10,000 calls, that is 500,000–1,000,000 event documents with no expiration strategy.

### 3.3 UI Gaps

#### G15 — No Call Detail Page
The backend endpoint and BFF proxy exist. The frontend page does not.

#### G16 — Call List Missing Key Columns
The current list shows: Call ID, Status, Duration, Total latency, Started time.
Missing: Agent name, Turn count, Summary, Ended by, Cost.

#### G17 — No Analytics Implementation
Dashboard, Analytics, and Live Calls pages are `ComingSoon` placeholders.

---

## 4. Recommended MongoDB Architecture

### 4.1 Collection Responsibilities (Revised)

```
calls              ← Permanent. Summary record. Read-heavy, small documents.
                     One document per call. Never grows after call ends.

call_events        ← Archival (TTL 90d). Append-only event stream.
                     Debug and timeline reconstruction. Many documents per call.

conversations      ← Semi-permanent. Live session state → archived transcript.
                     Hydrated at session start, updated per-turn, archived at end.
                     After archival: becomes the canonical transcript store.

agents             ← Permanent. Agent configurations.

agent_tools        ← Permanent. Agent-to-tool assignments.
```

No new collections are required for Phase 1. The existing five-collection structure is sound. The improvements below are additive field additions and behavioral changes within the existing collections.

### 4.2 Embed vs Reference Decisions

| Data                          | Decision          | Rationale                                                                 |
|-------------------------------|-------------------|---------------------------------------------------------------------------|
| Agent config at call time     | **Embed** in `calls.agentSnapshot` | Config changes; historical calls must preserve state at time of call. Small object (~500 bytes). |
| Transcript history            | **Reference** (`conversations`) | Can grow to hundreds of turns. Not needed on list view. Fetched separately. |
| LLM messages (OpenAI format)  | **Reference** (`conversations`) | Can be very large. Debug-only. Consider TTL after 30d. |
| Tool call history             | **Dual**: `conversations` + `call_events` | `conversations.toolCallHistory` for the clean tool-execution timeline. `call_events` for step-level debug. |
| Latency per-turn history      | **Reference** (`call_events`) | One `latency_snapshot` event per turn keeps `calls` small. |
| Latency aggregates (p50/p95)  | **Embed** in `calls.latencyMetrics` | Computed at session end; small; needed on list view. |
| Cost breakdown                | **Embed** in `calls.cost` | Small object; needed on list and detail views. |
| AI analysis                   | **Embed** in `calls.analysis` | Small object; generated once post-call; needed on detail view. |
| Custom metadata               | **Embed** in `calls.metadata` | Key-value map from call init; small; needed for analytics filtering. |
| Recording                     | **Embed** in `calls.recording` | URL + duration only; actual bytes in object storage. |

### 4.3 Document Lifecycle

#### `calls` Document

```
State: in_progress
  → Created by: CallLogsService.initCall() at session start
  → Fields written: callId, roomName, participantId, agentId, agentSnapshot, metadata, status='in_progress', createdAt

State: completed | error
  → Written by: CallLogsService.finalizeCall() at session stop
  → Fields written: status, endedBy, endedAt, durationMs, latencyMetrics (aggregates), turnCount, wordCount, cost

State: analysis_pending → analysis_complete
  → Written by: AnalysisService (async, post-call)
  → Fields written: summary, analysis.{sentiment, callSuccessful, successReason, topics}

Retention: Permanent. Never deleted or TTL'd.
```

#### `call_events` Document

```
Created by: EventLoggerService.log() throughout the call.
Append-only. Never mutated.

Retention: TTL index on `timestamp` field → expire after 90 days.
  (Summary data on `calls` is permanent; raw events are debug data)
  Exception: can extend to 365d for enterprise tiers via per-document `retainUntil` field.
```

#### `conversations` Document

```
State: active
  → Created by: ConversationStateService.getOrCreate() at session start
  → Mutated per-turn: transcriptHistory, llmMessages, toolCallHistory, lastUserUtterance, lastAgentResponse

State: archived
  → Written by: ConversationStateService.release() at session stop
  → Sets: archivedAt, currentStep='ended'
  → Active queries filter archivedAt:{ $exists: false }, so archived docs are invisible to live session queries

Retention of transcript: Permanent (transcriptHistory, toolCallHistory — human-readable, small)
Retention of llmMessages: TTL 30d — these are large (full OpenAI wire format with every turn)
  Implement via a separate scheduled job or a TTL on a `llmMessagesRetainUntil` field.
```

#### `agents` / `agent_tools` Documents

```
Retention: Permanent (logical delete only — add `deletedAt` field rather than hard-deleting,
           so historical calls referencing the agentId retain their foreign key integrity).
           The agentSnapshot on calls makes this less critical but good practice.
```

### 4.4 Required Indexes

#### `calls`
```
callId              unique, single-field (primary lookup)
roomName            single-field (webhook lookup by room)
agentId             single-field (filter by agent)
status              single-field (filter by status)
{ createdAt: -1 }   compound (default sort on list view)
{ agentId, createdAt: -1 }   compound (per-agent history)
{ status, createdAt: -1 }    compound (filter by status + sort)
metadata.*          sparse index on specific metadata keys as needed
```

#### `call_events`
```
eventId             unique, single-field
callId              single-field (all events for a call)
{ callId, timestamp: 1 }   compound (timeline view — existing, keep)
{ callId, step: 1 }        compound (filter by event type — existing, keep)
timestamp           TTL index → expire after 90 days
```

#### `conversations`
```
callId              unique, single-field (primary lookup — existing)
roomName            single-field (session service lookup — existing)
archivedAt          sparse, single-field (live session filter — existing)
```

### 4.5 What Goes in `calls` (Summary) vs `conversations` (Detail)

| Field                         | `calls` (summary) | `conversations` (detail) |
|-------------------------------|-------------------|--------------------------|
| callId, roomName, participantId | ✅              | ✅ (FK)                  |
| agentId                       | ✅                | ✅                       |
| agentSnapshot (config copy)   | ✅                | —                        |
| status, endedBy, endedAt, durationMs | ✅        | —                        |
| metadata (custom key-values)  | ✅                | —                        |
| turnCount, wordCount          | ✅                | —                        |
| latencyMetrics (aggregates)   | ✅                | —                        |
| cost (USD breakdown)          | ✅                | —                        |
| summary (AI-generated)        | ✅                | —                        |
| analysis.sentiment, callSuccessful | ✅           | —                        |
| recording.url                 | ✅                | —                        |
| callErrors (string[])         | ✅                | —                        |
| transcriptHistory (turns)     | —                 | ✅                       |
| llmMessages (OpenAI format)   | —                 | ✅ (TTL 30d)             |
| toolCallHistory               | —                 | ✅                       |
| systemPrompt (full text)      | —                 | ✅ (in agentSnapshot embed, but full prompt text only here) |

### 4.6 Archival / TTL Strategy

| Data                              | Retention     | Mechanism                                          |
|-----------------------------------|---------------|----------------------------------------------------|
| `calls` documents                 | Permanent     | No TTL. Size ~2–5 KB/call after enhancements.      |
| `call_events` documents           | 90 days       | MongoDB TTL index on `timestamp` field.            |
| `conversations.llmMessages`       | 30 days       | Scheduled job nulls/removes field after 30d.       |
| `conversations.transcriptHistory` | Permanent     | Retained with `calls` document.                    |
| `conversations.toolCallHistory`   | Permanent     | Small enough; retained.                            |
| `agents` / `agent_tools`          | Permanent     | Soft-delete via `deletedAt`.                       |

---

## 5. Schema Changes Required

### 5.1 `calls` Collection — Additions

```typescript
// --- Agent config at the time of the call ---
agentSnapshot: {
  name: string              // agent.name at call start
  systemPrompt: string      // first 2000 chars — enough for debug, not full prompt
  llmProvider: string       // e.g. 'openai'
  llmModel: string          // e.g. 'gpt-4o-mini'
  voiceId: string
  language: string
  enabledTools: string[]    // tool names active during this call
}

// --- Custom data from call initialisation ---
metadata: Record<string, string | number | boolean>
  // passed in POST /session/start body, stored verbatim
  // examples: { userId: 'u_123', planTier: 'pro', language: 'en-US' }

// --- Call counts (no event query needed) ---
turnCount: number           // incremented per agent_playback event
wordCount: number           // total words spoken (user + agent), summed at session end

// --- Cost breakdown (computed at session end) ---
cost: {
  sttCharacters: number
  ttsCharacters: number
  llmInputTokens: number
  llmOutputTokens: number
  totalCostUsd: number        // computed from provider rate cards
}

// --- AI analysis (written async post-call) ---
summary: string               // 1-3 sentence AI-generated description of the call
analysis: {
  sentiment: 'positive' | 'negative' | 'neutral' | 'unknown'
  callSuccessful: boolean | null   // null = not evaluated
  successReason: string            // short explanation
  topics: string[]                 // e.g. ['billing', 'refund', 'product-demo']
}

// --- Latency: replace raw timestamp map with structured aggregates ---
// Current: latencyMetrics: Record<string, number>  (raw epoch ms — confusing)
// Proposed:
latencyMetrics: {
  sttLatencyMs: number           // last turn STT latency
  llmLatencyMs: number           // last turn LLM latency
  ttsLatencyMs: number           // last turn TTS latency
  totalResponseLatencyMs: number // last turn end-to-end (user speech end → agent playback start)
  p50ResponseLatencyMs: number   // p50 across all turns
  p95ResponseLatencyMs: number   // p95 across all turns
  turnsWithLatency: number       // number of turns that contributed to p50/p95
}

// --- Recording (populated if recording is enabled) ---
recording: {
  url: string           // presigned or CDN URL
  storagePath: string   // internal object storage key
  durationMs: number
  sizeBytes: number
}
```

### 5.2 `calls` Collection — Changes to Existing Fields

```typescript
// Normalize endedBy to add 'unknown' fallback when agent stops unexpectedly
endedBy: 'participant' | 'agent' | 'timeout' | 'error' | 'unknown'
// (already present — just documenting it should be written reliably for all paths)

// Remove: latencyMetrics as a generic Record<string,number>
// Replace with: the structured object defined above in §5.1
```

### 5.3 `call_events` Collection — Changes

```typescript
// Rename roomId → roomName (field name fix — same value, different key)
// Currently: roomId: string
roomName: string   // consistent with calls collection

// latencyMs already exists on the schema ✅
// Ensure it is populated on ALL tool_result events (already done) ✅
```

### 5.4 `conversations` Collection — Additions

```typescript
// Enrich each transcript turn with timing and latency
transcriptHistory: {
  role: 'user' | 'agent'
  text: string
  timestamp: number         // epoch ms (already exists)
  // NEW:
  latencyMs?: number        // for agent turns: totalResponseLatencyMs for that turn
  sttLatencyMs?: number     // for user turns: time from speech_end to final transcript
  toolCallNames?: string[]  // tool names invoked during this agent turn (denormalized for transcript view)
  interrupted?: boolean     // true if agent was barged-in mid-response
  turnIndex: number         // 0-based turn number in the call
}

// Token usage per LLM call (enables cost calculation)
// Add to each llmMessages entry or as a separate parallel array
llmUsageHistory: {
  turnIndex: number
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp: number
}[]
```

### 5.5 New CallLogStep Values

```typescript
// Deprecate (keep for backward compat but stop emitting):
'turn_decision'         // was overloaded for three purposes

// Add (splitting turn_decision's three uses):
'user_turn_end'         // VAD / silence timer fired — user turn is complete
'agent_speech_start'    // agent begins pushing audio to room
'agent_speech_end'      // agent finishes pushing audio (or was interrupted)

// Add (new lifecycle events):
'agent_config_loaded'   // emitted at session_start with agentSnapshot payload
'cost_calculated'       // emitted at session_stop with cost breakdown payload
'analysis_complete'     // emitted when async AI analysis finishes
'latency_snapshot'      // emitted per turn with per-turn latency data (replaces 'performance')

// Deprecate:
'performance'           // duplicates calls.latencyMetrics — replace with latency_snapshot
```

---

## 6. Logging Improvements

### 6.1 Fix `PerformanceService` Durability

**Current problem**: All latency milestones are in a `Map<callId, milestones>` in memory. Server restart loses all in-flight data.

**Recommended fix**: Persist milestone events to `call_events` in real time as they fire. Each milestone becomes a `latency_snapshot` event with the turn index and milestone name. At session end, `finalizeCall` reads these events to compute p50/p95 aggregates.

Alternatively, use Redis (if available) as a durable in-memory store for active call metrics. Either approach is acceptable; the key constraint is that metric data must survive a server restart.

### 6.2 Per-Turn Latency Snapshots

After each completed agent response cycle (TTS done + playback started), emit a `latency_snapshot` event:

```typescript
{
  step: 'latency_snapshot',
  callId,
  data: {
    turnIndex: number,
    sttLatencyMs: number,
    llmLatencyMs: number,
    ttsLatencyMs: number,
    totalResponseLatencyMs: number,
    llmModel: string,
    toolsUsed: string[]
  },
  latencyMs: totalResponseLatencyMs  // also stored in top-level field
}
```

This replaces the current `performance` step and provides the raw material for p50/p95 computation at session end.

### 6.3 Agent Config Snapshot at Session Start

Emit `agent_config_loaded` as the first event after `session_start`:

```typescript
{
  step: 'agent_config_loaded',
  callId,
  data: {
    agentId,
    name,
    llmProvider,
    llmModel,
    voiceId,
    language,
    enabledTools: string[],
    systemPromptHash: string    // SHA-256 of systemPrompt, not full text (privacy)
  }
}
```

The full `agentSnapshot` (with first 2000 chars of system prompt) is written to `calls.agentSnapshot`.

### 6.4 Cost Tracking Integration Points

At session end, before `finalizeCall`, compute costs:

- **STT (Deepgram)**: Track total characters transcribed from all `stt_event` final transcript entries. Use Deepgram's rate card (e.g. $0.0059/min).
- **LLM (OpenAI)**: Track `usage.input_tokens` and `usage.output_tokens` from each LLM response. The `llm_response` events already contain the LLM response; add token counts to the event data and accumulate.
- **TTS (Cartesia)**: Track total characters sent to TTS from all TTS synthesis calls. Use Cartesia's rate card.

Write accumulated totals to `conversations.llmUsageHistory` per turn, then compute USD totals at `finalizeCall`.

### 6.5 `session_stop` Enrichment

`session_stop` should include a summary payload so the event stream is self-contained:

```typescript
{
  step: 'session_stop',
  callId,
  data: {
    endedBy: string,
    durationMs: number,
    turnCount: number,
    finalStatus: 'completed' | 'error',
    latencySummary: { p50, p95, turnsWithLatency }
  }
}
```

---

## 7. Missing Events and Metrics

### 7.1 Events That Should Exist But Don't

| Event Step            | When to Emit                                              | Payload                                          |
|-----------------------|-----------------------------------------------------------|--------------------------------------------------|
| `agent_config_loaded` | First thing after session_start                           | agentId, name, tools, llmModel, promptHash       |
| `user_turn_end`       | When VAD/silence timer decides user is done speaking      | triggerType: 'silence'\|'vad'\|'barge_in_cancel' |
| `agent_speech_start`  | When agent begins pushing PCM to room                     | turnIndex, textLength, chunkCount                |
| `agent_speech_end`    | When last audio chunk is written (or interrupted)         | turnIndex, actualDurationMs, interrupted: bool   |
| `latency_snapshot`    | After each completed turn                                 | per-turn STT/LLM/TTS/total ms + model + tools   |
| `cost_calculated`     | At session_stop before finalizeCall                       | STT chars/cost, LLM tokens/cost, TTS chars/cost  |
| `analysis_complete`   | When async post-call analysis finishes                    | summary, sentiment, callSuccessful, topics       |
| `barge_in`            | When user speaks while agent is speaking                  | agentTurnIndex, agentTextSoFar                   |
| `room_reconnect`      | If participant temporarily disconnects then reconnects    | reconnectCount, gapMs                            |

### 7.2 Metrics Not Currently Tracked

| Metric                    | Why Important                                                   | Where to Store              |
|---------------------------|-----------------------------------------------------------------|-----------------------------|
| Time to first agent word  | TTFW = from user speech end to first audio byte to client. The most user-perceptible latency metric. | `calls.latencyMetrics.ttfwMs` |
| Barge-in count            | How often user interrupted agent. High count = agent too verbose or slow. | `calls.turnCount` (separate `bargeInCount`) |
| Silence timeout count     | How often the session almost timed out from silence. | `calls.callErrors` or separate field |
| LLM retry count           | How often the LLM needed to be retried (tool loop iterations). | `call_events` orchestration_complete payload |
| Tool error rate           | What % of tool calls failed for this call.                     | `calls.toolErrorCount` / `toolCallCount` |
| STT character count       | Needed for cost. Total words recognized.                        | `calls.cost.sttCharacters`  |
| LLM token totals          | Needed for cost.                                               | `calls.cost.llmInputTokens` / `.llmOutputTokens` |
| TTS character count       | Needed for cost.                                               | `calls.cost.ttsCharacters`  |
| Max concurrent tool calls | Highest parallelism reached during a single LLM turn.          | `call_events` orchestration payloads |

---

## 8. API Changes Required

### 8.1 Existing Endpoints — Changes Needed

#### `GET /call-logs?limit&offset`
- **Rename to** `GET /calls` (or keep `/call-logs` and add `/calls` as an alias — either is fine, but document it)
- **Add filter params**: `?agentId=`, `?status=`, `?startAfter=`, `?startBefore=`, `?endedBy=`
- **Add sort params**: `?sortBy=createdAt|durationMs|totalResponseLatencyMs&order=asc|desc`
- **Add cursor pagination** option alongside offset (cursor is more reliable for live data)
- **Response should include** `agentSnapshot.name` in each summary row (currently requires a join)

#### `GET /call-logs/:callId`
- **Rename** events field to reflect it returns events (already named `events`)
- **Add `transcript` inline** as an option: `?include=transcript` — avoids a second round-trip for the detail page
- **Add `agentSnapshot`** in the response (written to `calls`, needs to be returned)
- **Add `analysis`** and `summary` in the response
- **Paginate events**: `?eventStep=tool_call,tool_result&cursor=` — a call with many turns produces hundreds of events; don't return them all unfiltered

#### `POST /session/start`
- **Accept `metadata` object** in the request body — key-value pairs stored on `calls.metadata`
- **Document the `agentId` param** — currently optional but not validated

### 8.2 New Endpoints Required

| Endpoint                                  | Description                                                                   | Priority |
|-------------------------------------------|-------------------------------------------------------------------------------|----------|
| `GET /calls/:callId/events?step=&cursor=` | Paginated event stream with step-type filtering. Replaces unfiltered full-load. | P1     |
| `GET /calls/:callId/analysis`             | Return `calls.summary` + `calls.analysis` fields.                             | P1       |
| `POST /calls/:callId/analysis`            | Trigger async AI analysis for a specific call (on-demand).                     | P1       |
| `GET /calls/stats?agentId=&period=`       | Aggregate stats: total calls, avg duration, avg latency, error rate, cost.    | P2       |
| `GET /calls/:callId/cost`                 | Detailed cost breakdown for a call.                                           | P2       |

### 8.3 BFF (Next.js) Proxy Updates

All new backend endpoints need corresponding BFF proxy routes in `web/src/app/api/`. The BFF should:
- Validate responses with Zod schemas
- Pass `agentId` filter as a query param through to the backend
- Cache call analysis responses (they don't change after written) with `revalidate: false`

---

## 9. UI: Current State and Missing Pieces

### 9.1 Call History List — Current vs Required

**Currently rendered**: Call ID (truncated), Status badge, Duration, Total response latency (color-coded), Started (relative time).

**Missing columns for a competitive call history list:**

| Column              | Source Field                          | Notes                                    |
|---------------------|---------------------------------------|------------------------------------------|
| Agent name          | `calls.agentSnapshot.name`            | Or `agents.name` via agentId lookup      |
| Call summary        | `calls.summary`                       | 1-line AI-generated preview              |
| Turn count          | `calls.turnCount`                     | "8 turns"                                |
| Ended by            | `calls.endedBy`                       | "Participant" / "Agent" / "Timeout"      |
| Tools used          | Derived from `call_events` or `conversations.toolCallHistory` | Count or names |
| Cost                | `calls.cost.totalCostUsd`             | "$0.04"                                  |
| Sentiment badge     | `calls.analysis.sentiment`            | Positive / Negative / Neutral            |

**UX patterns to adopt:**
- Status badge: green = `completed`, red = `error`, amber = `in_progress`
- Duration formatted as `mm:ss`, not raw milliseconds
- Started time: relative ("3 hours ago") with absolute on hover
- Sortable columns: started, duration, latency, cost
- Filterable: agent, status, date range
- Summary column: truncate at ~80 chars, tooltip for full text

### 9.2 Call Detail Page — Full Specification

The detail page (`/calls/:callId`) does not exist. It should have these sections:

#### Section 1: Header / Summary Bar
- Agent name + avatar
- Call ID (copyable)
- Status badge + ended by reason
- Duration (mm:ss)
- Date and time
- Cost
- Turn count

#### Section 2: AI Analysis Panel (when available)
- Call summary (2-4 sentences)
- Sentiment badge
- Call successful (yes / no / unknown)
- Topics tags
- Trigger on-demand analysis if not yet computed

#### Section 3: Transcript Viewer
- Turn-by-turn, speaker-labeled
- User turns: left-aligned, gray background
- Agent turns: right-aligned, brand color
- Timestamp per turn (relative from call start, e.g. "0:14")
- Per-agent-turn latency shown inline ("↓ LLM 0.9s")
- Tool calls shown inline in the agent turn where they fired
- Interrupted turns shown with a barge-in indicator

#### Section 4: Latency Breakdown
- Bar chart: STT / LLM / TTS per-turn across the call
- Highlight turns above p95 threshold
- Summary stats: p50, p95, best turn, worst turn

#### Section 5: Tool Execution Timeline
- Chronological list of all tool_call + tool_result pairs
- For each: tool name, arguments (collapsible JSON), result (collapsible JSON), latency, success/failure badge

#### Section 6: Debug Events (Collapsible)
- Full `call_events` stream, paginated
- Filterable by step type
- Raw JSON view per event

#### Section 7: Cost Breakdown (when available)
- STT: N characters × rate = $X.XX
- LLM: N input + N output tokens × rate = $X.XX
- TTS: N characters × rate = $X.XX
- Total

### 9.3 Analytics Page — Required for Production

The analytics page should aggregate across calls:

- **Total calls** (period selector: 7d / 30d / 90d)
- **Calls by status** (pie or donut: completed / error / in_progress)
- **Calls by agent** (bar chart)
- **Average duration trend** (line chart by day)
- **Latency trend** (p50 / p95 line chart by day)
- **Error rate trend** (line chart)
- **Tool usage frequency** (which tools fired most)
- **Total cost** (by period, by agent)
- **Sentiment distribution** (positive / negative / neutral over time)

All of these are derivable from `calls` documents alone (no event joins needed for aggregation).

---

## 10. Prioritized Implementation Plan

### P0 — Foundation for the Detail Page (Implement first, ~1–2 days)

These are prerequisite data changes that must exist before the detail page can be built. All are additive and non-breaking.

| # | Change | File(s) | Notes |
|---|--------|---------|-------|
| P0-1 | Split `turn_decision` into `user_turn_end`, `agent_speech_start`, `agent_speech_end` | `call-log.types.ts` (add steps), `VoiceAgentService.publishAudioToRoom`, turn detection code | Keep `turn_decision` in the enum for backward compat; stop emitting it |
| P0-2 | Replace `performance` event with `latency_snapshot` | `VoiceAgentService` (after each TTS cycle) | Emit `latency_snapshot` with per-turn breakdown. Remove `performance` step emit. |
| P0-3 | Rename `roomId` → `roomName` on `CallLogEntry` | `call-log.types.ts`, `CallEventEntity`, all callsites | Breaking change in event shape; run a migration script |
| P0-4 | Add `agentSnapshot` to `CallEntity`, `CallRecord`, and factory | `call.schema.ts`, `call-log.types.ts`, `call-record.factory.ts` | Write from `AgentConfig` in `CallLogsService.initCall` |
| P0-5 | Add `turnCount` to `CallEntity` | `call.schema.ts` | Increment in `finalizeCall` by counting `agent_playback` events or tracking in session context |
| P0-6 | Persist per-turn latency milestones via `latency_snapshot` events | `PerformanceService`, `EventLoggerService` | Replaces in-memory-only approach |
| P0-7 | Compute and write `latencyMetrics.p50ResponseLatencyMs` and `p95ResponseLatencyMs` at `finalizeCall` | `CallLogsService.finalizeCall`, `PerformanceService` | Reads `latency_snapshot` events for the call and computes percentiles |

### P1 — Build the Call Detail Page (~3–4 days)

These changes enable a high-quality detail page. Depends on P0 being complete.

| # | Change | File(s) | Notes |
|---|--------|---------|-------|
| P1-1 | Implement `/calls/:callId` frontend page | `web/src/app/(shell)/calls/[callId]/page.tsx` | Header, transcript, tool timeline sections minimum |
| P1-2 | Enrich transcript entries with `turnIndex`, `latencyMs`, `toolCallNames` | `conversations` schema, `ConversationStateService` | Add fields when appending to `transcriptHistory` |
| P1-3 | Add `metadata` field to `CallEntity` and write from `POST /session/start` | `call.schema.ts`, `SessionController`, `CallLogsService.initCall` | Accept `metadata` object in session start request |
| P1-4 | Add `GET /calls/:callId/events?step=&cursor=` endpoint | `CallLogsController` | Paginated, step-filtered event query |
| P1-5 | Add `agent_config_loaded` event at session start | `VoiceAgentService.startSession` | Payload: agentId, name, tools, llmModel, promptHash |
| P1-6 | Update `GET /calls` and `GET /call-logs/:callId` to return `agentSnapshot.name` | `CallLogsController`, repository queries | No new endpoint needed, just add field to existing response |
| P1-7 | Add filter/sort params to `GET /calls` | `CallLogsController`, `MongoCallLogsRepository` | `?agentId=`, `?status=`, `?startAfter=`, `?startBefore=`, `?sortBy=` |

### P1 — Enrich Call History List (~1 day, parallel with detail page)

| # | Change | Notes |
|---|--------|-------|
| P1-8 | Add agent name column to call list | Returned from `agentSnapshot.name` — no extra query needed |
| P1-9 | Add turn count column | From `calls.turnCount` (P0-5) |
| P1-10 | Add ended by column | Already on `calls.endedBy`; just not rendered |
| P1-11 | Add p50/p95 latency columns (toggle)  | From `calls.latencyMetrics.p50ResponseLatencyMs` |

### P2 — AI Analysis and Cost Tracking (~2–3 days)

| # | Change | File(s) | Notes |
|---|--------|---------|-------|
| P2-1 | Track LLM token usage per turn | `OrchestratorService`, `conversations.llmUsageHistory` | Read `usage` from OpenAI response, write to new `llmUsageHistory` array |
| P2-2 | Track STT character count per call | `VoiceAgentService`, `calls.cost.sttCharacters` | Accumulate lengths of final stt_event transcripts |
| P2-3 | Track TTS character count per call | TTS provider calls, `calls.cost.ttsCharacters` | Accumulate lengths of all TTS synthesis inputs |
| P2-4 | Compute and write `calls.cost` at `finalizeCall` | `CallLogsService.finalizeCall` | Apply per-provider rate cards |
| P2-5 | Implement `AnalysisService` | New `analysis/analysis.service.ts` | Calls LLM post-call to generate summary, sentiment, topics. Writes to `calls`. Emits `analysis_complete` event. |
| P2-6 | Add `POST /calls/:callId/analysis` endpoint | `CallLogsController` | Trigger on-demand or automatically at call end |
| P2-7 | Add analysis panel to call detail page | Frontend | Show summary, sentiment, success eval, topics |
| P2-8 | Add cost breakdown to call detail page | Frontend | Requires P2-4 |
| P2-9 | Add `wordCount` to `calls` | `CallLogsService.finalizeCall` | Sum word counts from `transcriptHistory` |

### P2 — Data Quality Fixes (~1 day)

| # | Change | Notes |
|---|--------|-------|
| P2-10 | Add TTL index (90d) to `call_events.timestamp` | One migration + index definition in `call-event.schema.ts` |
| P2-11 | Add scheduled job to strip `conversations.llmMessages` after 30d | Background job or Atlas scheduled trigger |
| P2-12 | Add `cost_calculated` event at session stop | Payload: full cost breakdown |
| P2-13 | Remove `agentSnapshot.systemPrompt` from embed (use hash only) | Privacy consideration — full prompts should not be in summary records |

### P3 — Analytics Dashboard and Premium UX (~5+ days)

| # | Change | Notes |
|---|--------|-------|
| P3-1 | Implement Analytics page with aggregation endpoint | `GET /calls/stats?period=&agentId=` using MongoDB aggregation pipeline |
| P3-2 | Implement Dashboard page with real call volume, error rates, latency trends | Requires P2-1 through P2-9 for cost/sentiment data |
| P3-3 | Add barge-in count and tool error rate to `calls` | Track `bargeInCount`, `toolCallCount`, `toolErrorCount` |
| P3-4 | Add per-turn latency chart to call detail page | Requires `latency_snapshot` events (P0-2) |
| P3-5 | Add recording support | LiveKit recording, object storage integration, presigned URL on `calls.recording` |
| P3-6 | Add cursor-based pagination to `GET /calls` | More reliable than offset for live-updating data |
| P3-7 | ElevenLabs-style evaluation criteria | Define per-agent success criteria, evaluate against transcript at call end |

---

## Summary

The platform's foundation is strong: the three-collection split (`calls` / `call_events` / `conversations`) is architecturally correct for a list/detail UI pattern, the event taxonomy is comprehensive, and the call lifecycle is fully wired. The gap to production-grade is not a redesign — it is a focused set of additions.

The four highest-value improvements in order:

1. **`agentSnapshot` on `calls`** (P0-4) — unlocks agent-name display in the list and call config context in the detail, and is the most common thing users need to debug a past call.
2. **Per-turn latency via `latency_snapshot`** (P0-6, P0-7) — replaces the lossy in-memory metric with durable per-turn data and enables p50/p95 display, the metric that distinguishes good voice platforms from great ones.
3. **AI-generated `summary` on `calls`** (P2-5) — the single highest-value field for navigating a long call history list. All four leading platforms have this; it transforms a table of opaque call IDs into a scannable list of conversations.
4. **The Call Detail page** (P1-1 through P1-6) — the frontend surface that makes all the existing backend data visible.

The existing `CALL_LOGGING_READINESS_ANALYSIS.md` described what was needed before the UI could be started. This document describes what is needed to make the platform production-grade and competitive with Retell, VAPI, Bland, and ElevenLabs.
