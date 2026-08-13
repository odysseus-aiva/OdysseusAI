# Backend Changes — Call History Readiness

Changes implemented across P0, P1, and P2 to make the backend suitable for a
Call History UI. Based on `CALL_LOGGING_READINESS_ANALYSIS.md`.

---

## P0 — Required Before Any UI

### 1. `CallRecord` type + `CallEntity` schema — lifecycle fields

**Files:** `src/common/types/call-log.types.ts`, `src/persistence/mongo/schemas/call.schema.ts`

| Field        | Type          | Description                                                                         |
| ------------ | ------------- | ----------------------------------------------------------------------------------- |
| `status`     | `CallStatus`  | `'in_progress'` \| `'completed'` \| `'error'`. Default: `'in_progress'`.          |
| `endedBy`    | `CallEndedBy` | `'participant'` \| `'agent'` \| `'timeout'` \| `'error'` \| `'unknown'`.          |
| `endedAt`    | `number`      | Epoch ms when `stopSession` was called.                                             |
| `durationMs` | `number`      | `endedAt - createdAt` in milliseconds.                                              |
| `agentId`    | `string`      | ID of the named agent config — was on the schema but silently dropped. Now flows through `initCall`. |

`CallEntity` also gains a compound index `{status, createdAt: -1}` for filtered list queries.

**New types exported from `call-log.types.ts`:**
```ts
type CallStatus = 'in_progress' | 'completed' | 'error';
type CallEndedBy = 'participant' | 'agent' | 'timeout' | 'error' | 'unknown';
```

---

### 2. `createCallRecord` factory — `agentId` parameter

**File:** `src/call-logs/call-record.factory.ts`

Added optional fourth parameter `agentId?: string`. Records initialize with `status: 'in_progress'`.

---

### 3. Repository interface — new methods

**File:** `src/call-logs/interfaces/call-logs-repository.interface.ts`

```ts
interface CallSummary { /* summary fields — no logs array */ }

interface CallLogsRepository {
  finalizeCall(callId, outcome): Promise<void>;
  listSummaries(opts: { limit, offset }): Promise<CallSummary[]>;
  countAll(): Promise<number>;
  // listAll() retained but deprecated
}
```

`CallSummary` is a lightweight type containing only `calls` collection fields
(no events array). Used by the list endpoint to avoid N+1 queries.

---

### 4. Both repository implementations updated

**Files:** `src/call-logs/repositories/in-memory-call-logs.repository.ts`,
`src/persistence/mongo/mongo-call-logs.repository.ts`

- `InMemoryCallLogsRepository`: `finalizeCall` mutates the stored record.
  `listSummaries` sorts by `createdAt desc` and slices. `countAll` returns map size.
- `MongoCallLogsRepository`: `finalizeCall` issues a targeted `$set` update.
  `listSummaries` is a **summary-only query** against `calls` — no join to
  `call_events`. This replaces the N+1 `listAll` for list views.
  `countAll` uses `countDocuments()`.

---

### 5. `CallLogsService` — new public methods

**File:** `src/call-logs/call-logs.service.ts`

```ts
// Stamp the call as finalized. Called once at session stop.
finalizeCall(callId: string, endedBy: CallEndedBy, hasErrors: boolean): Promise<void>

// Paginated list — no events loaded.
listCalls(opts: { limit?, offset? }): Promise<{ total: number; calls: CallSummary[] }>
```

`initCall` now accepts an optional fourth parameter `agentId?: string`.
`finalizeCall` derives `status` from `hasErrors`, computes `durationMs = endedAt - record.createdAt`.
Maximum `limit` is capped at 200.

---

### 6. `VoiceAgentService.stopSession` — finalization call

**File:** `src/voice-agent/voice-agent.service.ts`

`stopSession` now accepts an optional `endedBy: CallEndedBy` parameter
(defaults to `'participant'`). At session stop it calls `callLogsService.finalizeCall`.

Three call sites updated:
- Frontend disconnect via `SessionService.stopSession` → `'participant'`
- LiveKit `room_finished` webhook → `'timeout'`
- `end_call` tool completion → `'agent'`

---

### 7. Two new HTTP endpoints

**File:** `src/call-logs/call-logs.controller.ts`

#### `GET /call-logs`

Paginated call history list. Returns summary rows only — no events loaded.

| Param    | Type    | Default | Max | Description            |
| -------- | ------- | ------- | --- | ---------------------- |
| `limit`  | integer | `50`    | `200` | Rows per page.       |
| `offset` | integer | `0`     | —   | Zero-based row offset. |

**Response:**
```jsonc
{
  "total": 142,
  "calls": [
    {
      "callId": "uuid",
      "roomName": "voice-uuid",
      "participantId": "user-uuid",
      "agentId": "sales-agent",
      "status": "completed",
      "endedBy": "participant",
      "endedAt": 1720000000000,
      "durationMs": 187432,
      "createdAt": 1719812567000,
      "updatedAt": 1720000000000,
      "latencyMetrics": {
        "totalResponseLatencyMs": 1240,
        "sttLatencyMs": 180,
        "llmLatencyMs": 890,
        "ttsLatencyMs": 640
      },
      "errors": []
    }
  ]
}
```

Sorted by `createdAt` descending (newest first).

#### `GET /call-logs/:callId/transcript`

Returns the clean turn-by-turn transcript from `conversations.transcriptHistory`.

**Response:**
```jsonc
{
  "callId": "uuid",
  "transcript": [
    { "role": "assistant", "text": "Hello! How can I help you today?", "timestamp": 1719812570000 },
    { "role": "user",      "text": "What's the weather like?",          "timestamp": 1719812574000 },
    { "role": "assistant", "text": "It's currently 22°C and sunny.",    "timestamp": 1719812576000 }
  ],
  "lastUserUtterance": "What's the weather like?",
  "lastAgentResponse": "It's currently 22°C and sunny."
}
```

Returns `404` if no conversation state exists for the `callId`.

#### `GET /call-logs/:callId` — updated response shape

The existing endpoint now includes: `agentId`, `status`, `endedBy`, `endedAt`, `durationMs`.

---

## P1 — Data Quality Improvements

### 8. Pre-computed per-segment latency durations

**Files:** `src/common/types/performance.types.ts`, `src/performance/performance.service.ts`

`LatencyMetrics` gains three pre-computed duration fields that the UI can use
directly — no more client-side subtraction of epoch pairs:

| Field          | Computation                                    |
| -------------- | ---------------------------------------------- |
| `sttLatencyMs` | `stt_final_transcript - user_speech_end`       |
| `llmLatencyMs` | `llm_end - llm_start`                          |
| `ttsLatencyMs` | `tts_end - tts_start`                          |

`PerformanceService.calculateLatency` now populates all three whenever the
required milestone pair has been recorded. They are persisted onto
`calls.latencyMetrics` at the end of each turn via
`CallLogsService.updateLatencyMetrics`.

---

### 9. `agent_speech_start` / `agent_speech_end` events

**Files:** `src/common/types/call-log.types.ts`, `src/voice-agent/voice-agent.service.ts`

Replaced `turn_decision` event overloading with two dedicated `CallLogStep` values:

| Step                | When emitted                                     | Data payload                        |
| ------------------- | ------------------------------------------------ | ----------------------------------- |
| `agent_speech_start`| When agent begins playing audio (TTS→PCM ready) | `{ generationId }`                  |
| `agent_speech_end`  | When agent audio playback finishes or is cut     | `{ durationMs }` (speech duration in ms) |

The `turn_decision` step now exclusively represents turn-detection decisions —
no longer overloaded for speech lifecycle events.

---

### 10. Tool execution latency on `tool_result` events

**File:** `src/orchestration/tool-execution.service.ts`

`tool_result` events now carry `latencyMs` — the wall-clock time from when
`tool.execute()` was called to when it resolved or rejected. This includes any
timeout period. The `tool_call` event (emitted before execution) has no latency
by definition; only `tool_result` carries it.

---

## P2 — Schema Normalization

### 11. `roomId` → `roomName` rename

**Files:** `src/common/types/call-log.types.ts`, `src/persistence/mongo/schemas/call-event.schema.ts`,
`src/call-logs/call-logs.service.ts`, `src/orchestration/event-logger.service.ts`,
`src/voice-agent/voice-agent.service.ts`, `src/orchestration/orchestrator.service.ts`,
`src/livekit/livekit.service.ts`, `src/persistence/mongo/mongo-call-logs.repository.ts`

`CallLogEntry.roomId` renamed to `CallLogEntry.roomName`. The `call_events`
MongoDB collection now stores the field as `roomName` to match the `calls`
collection. All callsites updated.

**Migration note:** Existing `call_events` documents have `roomId`. New
documents will have `roomName`. A query that needs to cover both generations
must use `{ $or: [{ roomName: ... }, { roomId: ... }] }` until the collection
is backfilled. For UI purposes, this field is informational only — call routing
uses `callId`.

---

### 12. `performance` log step removed

**File:** `src/voice-agent/voice-agent.service.ts`

The redundant `performance` event emitted at the end of every turn has been
removed. The same data is now stored structurally on `calls.latencyMetrics`
(with pre-computed durations — see change #8), making the `call_events` entry
redundant. This reduces write volume per turn by one document.

The `'performance'` value has been removed from the `CallLogStep` union type.

---

## Assumptions Made

1. **Duration = `endedAt - createdAt`**, not `endedAt - startedAt`. `createdAt`
   is when the call record was initialized. Matches how Retell and Bland measure
   duration.

2. **`endedBy` defaults to `'participant'`** for unknown disconnection paths.

3. **`status: 'error'`** is derived from whether `session.error` was set —
   at least one pipeline turn threw an unhandled exception.

4. **The transcript endpoint reads from `conversations`**, not `call_events`.
   `conversations.transcriptHistory` is the canonical structured transcript.

5. **`ConversationStateRepository` is injected directly** into the controller
   via the global `CONVERSATION_STATE_REPOSITORY` token to avoid a circular
   dependency with `OrchestrationModule`.

6. **No migration scripts** for existing MongoDB records:
   - Pre-P0 `calls` docs: `status: null` → read-time default `'in_progress'`.
   - Pre-P2 `call_events` docs: `roomId` field persists on old documents.

7. **`sttLatencyMs`** measures from `user_speech_end` to `stt_final_transcript`,
   not from `user_speech_start`. This is the additional processing time after
   the user finished speaking — the most actionable measure of STT lag.

8. **`agent_speech_end.durationMs`** can be `undefined` if `beginAgentSpeech`
   was never called before `endAgentSpeech` (e.g. a skipped/interrupted turn
   that never reached playback). The UI should treat `undefined` as 0.

---

## Remaining Limitations

- **No `turnCount` on calls.** The list cannot show "8 turns" without loading
  events. Requires a counter incremented per `agent_playback` event.

- **No call summary text.** No AI-generated or heuristic description of call
  content. The first/last agent utterance can be used as a proxy via
  `GET /call-logs/:callId/transcript` → `lastAgentResponse`.

- **Pre-P2 `call_events` docs** still have `roomId`. A backfill migration would
  unify the field name across the entire collection.

- **Pre-P0 calls** with `status: null` appear as `'in_progress'` in the list.
  The UI should display these as "Legacy" rather than active.
