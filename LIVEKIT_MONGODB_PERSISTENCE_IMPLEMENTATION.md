# MongoDB Persistence — Implementation

Configuration-driven persistence for the LiveKit voice agent POC.  
Design doc: [LIVEKIT_MONGODB_PERSISTENCE_PLAN.md](./LIVEKIT_MONGODB_PERSISTENCE_PLAN.md)

---

## What was implemented

| Layer | Description |
|-------|-------------|
| `PersistenceModule` | Selects memory or MongoDB via env — **no code changes** to switch deployments |
| `MongoCallLogsRepository` | `calls` + `call_events` collections |
| `MongoConversationStateRepository` | `conversations` collection with archive on session stop |
| Repository interfaces | `CallLogsRepository`, `ConversationStateRepository` |
| In-memory fallbacks | Default for local dev when MongoDB is not configured |

---

## Configuration

Switching MongoDB deployments requires **only environment variables**:

```bash
# Use MongoDB (Atlas, Docker, self-hosted, etc.)
PERSISTENCE_PROVIDER=mongodb
MONGODB_URI=mongodb+srv://user:pass@cluster.example.net/mydb?retryWrites=true&w=majority

# Optional — database name if not included in URI
MONGODB_DB_NAME=livekit_voice_agent
```

```bash
# Local dev without MongoDB (default)
PERSISTENCE_PROVIDER=memory
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PERSISTENCE_PROVIDER` | `memory` | `memory` or `mongodb` |
| `MONGODB_URI` | *(empty)* | Full MongoDB connection string |
| `MONGODB_DB_NAME` | `livekit_voice_agent` | Database name (optional if URI includes it) |

The NestJS app reads config from `src/config/configuration.ts`. Mongoose connects using **only** `MONGODB_URI` (+ optional `MONGODB_DB_NAME`). No hosts, clusters, or credentials are hardcoded.

---

## Collections

| Collection | Purpose |
|------------|---------|
| `calls` | Call metadata, latency rollup, errors |
| `call_events` | Append-only pipeline/orchestration events |
| `conversations` | Transcripts, LLM messages, tool history |

---

## Architecture

```
AppModule
  └── PersistenceModule.forRoot()     # global, config-driven
        ├── memory → InMemory*Repository
        └── mongodb → MongooseModule + Mongo*Repository

CallLogsService ──► CALL_LOGS_REPOSITORY
ConversationStateService ──► CONVERSATION_STATE_REPOSITORY
```

Services (`VoiceAgentService`, `OrchestratorService`, `EventLoggerService`) are unchanged at the API level — only the repository implementation swaps.

---

## Behavior notes

- **Call events** are inserted one document at a time (not embedded in `calls`) for STT volume.
- **Webhook logs** are trimmed before persist (event type + summary, not full raw payload).
- **Conversation state** is archived (`archivedAt`) on `stopSession()`, not hard-deleted.
- **API shape** unchanged: `GET /call-logs/:callId` still returns `logs[]` aggregated from `call_events`.

---

## Verify MongoDB persistence

1. Start MongoDB locally or use Atlas.
2. Set env:
   ```bash
   PERSISTENCE_PROVIDER=mongodb
   MONGODB_URI=mongodb://127.0.0.1:27017/livekit_voice_agent
   ```
3. Run a voice agent session.
4. Restart the NestJS server.
5. `GET /call-logs/:callId` — logs should still be present.

---

## Project layout

```
src/persistence/
├── persistence.module.ts
├── persistence.config.ts
└── mongo/
    ├── mongo-call-logs.repository.ts
    ├── mongo-conversation-state.repository.ts
    └── schemas/
        ├── call.schema.ts
        ├── call-event.schema.ts
        └── conversation.schema.ts
```

---

## Known limitations

- `PerformanceService` milestones remain in-memory (latency rollup is on `calls.latencyMetrics`).
- No TTL indexes on `call_events` yet.
- No list/query admin APIs beyond existing endpoints.
- `agents` / `post_call_analyses` collections not implemented.

---

## Next steps

1. TTL / retention policy on `call_events`
2. Persist performance milestones per turn
3. `GET /call-logs` list endpoint with filters
4. Redis cache layer for hot conversation state (optional)
