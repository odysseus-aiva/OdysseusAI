# OdysseusAI — Voice Agent Platform

A production-structured NestJS backend powering the OdysseusAI voice agent platform. Providers (STT, LLM, TTS) are swappable via interfaces, with structured call logging and latency measurement built in. Supports both the default Pipeline engine and the PyAI Omni engine.

## Architecture

```
┌─────────────┐     POST /livekit/token      ┌──────────────────┐
│   Client    │ ───────────────────────────► │  LiveKit Module  │
│  (browser/  │     POST /livekit/webhook    │  - tokens        │
│   SIP)      │ ◄─────────────────────────── │  - rooms         │
└──────┬──────┘                              │  - webhooks      │
       │                                     └────────┬─────────┘
       │ joins room via LiveKit                       │
       ▼                                              ▼
┌─────────────┐     POST /voice-agent/start  ┌──────────────────┐
│  LiveKit    │ ◄─────────────────────────── │ Voice Agent Mod  │
│    Room     │                              │  - orchestration │
└─────────────┘                              │  - turn detect   │
                                             └────────┬─────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────┐
                    ▼                                 ▼                         ▼
             ┌──────────┐                    ┌──────────┐              ┌──────────┐
             │   STT    │                    │   LLM    │              │   TTS    │
             │ Deepgram │                    │ OpenAI/  │              │ ElevenLabs│
             │ (swap)   │                    │ Claude   │              │ OpenAI/  │
             └──────────┘                    └──────────┘              │ Cartesia │
                                                                        └──────────┘
                    │
                    ▼
             ┌──────────────┐     ┌──────────────────┐
             │  Call Logs   │     │   Performance    │
             │ (in-memory)  │     │  latency metrics │
             └──────────────┘     └──────────────────┘
```

### Module overview

| Module | Responsibility |
|--------|----------------|
| `livekit` | Access tokens, room create/get, webhook routing, SIP-ready config |
| `voice-agent` | Session lifecycle, STT turn detection, TTS + LiveKit playback |
| `orchestration` | Prompt, tools, state, guardrails |
| `stt` | `transcribeStream()` provider interface (Deepgram) |
| `llm` | `generateResponse()` with optional tool calling (OpenAI) |
| `tts` | `synthesizeSpeech()` provider interface (ElevenLabs, OpenAI, Cartesia) |
| `call-logs` | Per-call event log + in-memory repository (swap for Mongo/Postgres) |
| `performance` | Milestone timestamps and end-to-end latency calculation |

## Setup

### Prerequisites

- Node.js 18+
- npm
- A [LiveKit Cloud](https://cloud.livekit.io/) project (or self-hosted LiveKit server)

### Install

```bash
cp .env.example .env
# Fill in your environment variables in .env

npm install
npm run build
npm run start:dev
```

The server starts on `http://localhost:3000` by default.

## Environment variables

See [`.env.example`](.env.example) for all placeholders.

| Variable | Description |
|----------|-------------|
| `LIVEKIT_URL` | LiveKit server URL (e.g. `wss://your-project.livekit.cloud`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_WEBHOOK_SECRET` | Optional webhook signing secret |
| `DEEPGRAM_API_KEY` | Deepgram API key for STT |
| `OPENAI_API_KEY` | OpenAI API key for LLM/TTS |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude LLM |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for TTS |
| `CARTESIA_API_KEY` | Cartesia API key for TTS |
| `PYAI_API_KEY` | PyAI API key (Omni engine) |
| `PYAI_BASE_URL` | PyAI base URL (default `https://api.pyai.com/v1`) |
| `DEFAULT_STT_PROVIDER` | `deepgram` (default) |
| `DEFAULT_LLM_PROVIDER` | `openai` or `claude` |
| `DEFAULT_TTS_PROVIDER` | `elevenlabs`, `openai`, or `cartesia` |
| `ORCHESTRATION_MAX_TOOL_LOOPS` | Max tool-calling rounds per turn (default `3`) |
| `ORCHESTRATION_TOOL_TIMEOUT_MS` | Per-tool timeout in ms (default `5000`) |
| `ORCHESTRATION_FALLBACK_RESPONSE` | Spoken fallback when orchestration fails |
| `PERSISTENCE_PROVIDER` | `memory` (default) or `mongodb` |
| `MONGODB_URI` | MongoDB connection string (required when provider is `mongodb`) |
| `MONGODB_DB_NAME` | Database name (default `odysseus_ai`) |

## API usage

### 1. Generate a LiveKit token

```bash
curl -X POST http://localhost:3000/livekit/token \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "support-room-1",
    "participantName": "user-123",
    "metadata": { "callId": "call-abc" }
  }'
```

Response:

```json
{
  "token": "<jwt>",
  "roomName": "support-room-1",
  "participantName": "user-123",
  "livekitUrl": "wss://your-project.livekit.cloud"
}
```

Use the token with the [LiveKit client SDK](https://docs.livekit.io/client-sdk-js/) to join the room.

### 2. Start a voice agent session

```bash
curl -X POST http://localhost:3000/voice-agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "support-room-1",
    "callId": "call-abc",
    "agentConfig": {
      "systemPrompt": "You are a helpful support agent.",
      "sttProvider": "deepgram",
      "llmProvider": "openai",
      "ttsProvider": "elevenlabs",
      "turnSilenceMs": 700,
      "agentId": "support-agent",
      "dynamicVariables": { "company": "Acme" },
      "enabledTools": ["get_user_details"]
    }
  }'
```

### 3. Get session state and logs

```bash
curl http://localhost:3000/voice-agent/session/support-room-1
```

### 4. Get call logs by call ID

```bash
curl http://localhost:3000/call-logs/call-abc
```

### 5. LiveKit webhooks

Configure your LiveKit project to send webhooks to:

```
POST http://your-server/livekit/webhook
```

Events (`participant_joined`, `participant_left`, `room_finished`) are logged and routed to the voice agent.

## Project structure

```
src/
├── config/              # Environment configuration
├── common/types/        # Shared TypeScript interfaces
├── livekit/             # Tokens, rooms, webhooks, RTC
├── voice-agent/         # Session lifecycle + turn detection
├── orchestration/       # Prompt, tools, state, guardrails
├── stt/                 # STT providers
├── llm/                 # LLM providers (tool calling)
├── tts/                 # TTS providers
├── call-logs/           # In-memory call log repository
└── performance/         # Latency measurement
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start server |
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Run ESLint |

## License

UNLICENSED — private.
