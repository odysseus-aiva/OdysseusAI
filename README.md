# OdysseusAI — Voice Agent Platform

Build a voice agent, talk to it in the browser or over a real phone number, and get a
complete record of every call: turn-by-turn transcript, per-stage latency, every tool
execution, and the provider cost down to six decimal places.

Two engines run behind the same interface — a **swappable STT → LLM → TTS pipeline**
(Deepgram / OpenAI / ElevenLabs, each replaceable) and **PyAI Omni**, a single
speech-to-speech WebSocket. Switching an agent between them is a dropdown, and the
dashboard prices both so you can see what the tradeoff actually costs.

[https://github.com/user-attachments/assets/add63f6b-1d8f-467b-bd63-00edcabb6c4e](https://github.com/user-attachments/assets/add63f6b-1d8f-467b-bd63-00edcabb6c4e)

## Five-minute setup

Sample data is included, so you get a populated dashboard without placing a call.

**Prerequisites:** Node 18+, MongoDB running locally (`brew install mongodb-community`
or Docker), and a free [LiveKit Cloud](https://cloud.livekit.io/) project.

### 1. Install both apps (~90s)

```bash
git clone <this-repo> && cd OdysseusAI
npm install
cd web && npm install && cd ..
```



### 2. Configure the backend (~2 min)

```bash
cp .env.example .env
```

Open `.env` and fill in the values below. **Required** ones are the minimum to get a working
voice call. Everything else has a working default or is optional.

---



#### LiveKit — WebRTC transport (required)

LiveKit is the real-time media layer every call travels through. Without it nothing connects.


| Variable             | How to get it                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVEKIT_URL`        | [cloud.livekit.io](https://cloud.livekit.io) → **Settings → API Keys** → Create Key -> Websocket URL(e.g. `wss://your-project.livekit.cloud`) |
| `LIVEKIT_API_KEY`    | Same page → API Key                                                                                                                           |
| `LIVEKIT_API_SECRET` | Same page → API Secret                                                                                                                        |
---



#### PyAI — Omni engine (required)

The default voice console agent runs on PyAI Omni — a single speech-to-speech WebSocket
that handles STT + LLM + TTS in one ~500 ms round trip. Also used as the STT provider for
transcribing the agent's own audio on that engine.


| Variable        | How to get it                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `PYAI_API_KEY`  | Instant sandbox key, **no account needed**: `curl -X POST https://api.pyai.com/v1/sandbox/keys` — copy the key from the response |
| `PYAI_BASE_URL` | Leave blank — defaults to `https://api.pyai.com/v1`                                                                              |


---



#### OpenAI — LLM + TTS for the pipeline engine (required for pipeline agents)

The pipeline engine (STT → LLM → TTS) uses OpenAI for both the language model and speech
synthesis by default. If you only use Omni agents you can skip this, but the three sample
agents include two pipeline agents.


| Variable               | How to get it                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key |
| `DEFAULT_LLM_PROVIDER` | `openai` (default) or `claude` — which LLM pipeline agents use                               |
| `DEFAULT_TTS_PROVIDER` | `openai` (default), `elevenlabs`, `cartesia`, or `pyai`                                      |


---



#### MongoDB — persistence + sample data (required for dashboard)

Without MongoDB, every call is lost on restart and `npm run seed` has nowhere to write.
Set `PERSISTENCE_PROVIDER=memory` only for a quick smoke-test with no history.

```ini
PERSISTENCE_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=odysseus_ai
```

**Local install:** `brew install mongodb-community && brew services start mongodb-community`
**Docker:** `docker run -d -p 27017:27017 mongo`

---



#### Deepgram — STT fallback (optional)

Used as the automatic fallback STT provider when PyAI is unavailable. Also selectable as
`DEFAULT_STT_PROVIDER=deepgram` for pipeline agents.


| Variable               | How to get it                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `DEEPGRAM_API_KEY`     | [console.deepgram.com](https://console.deepgram.com) → Create API Key — free tier covers dev usage |
| `DEFAULT_STT_PROVIDER` | `deepgram` or `pyai`                                                                               |


---



#### Alternative TTS providers (optional)

Swap voices without changing your agent — just set `DEFAULT_TTS_PROVIDER` or pick a voice
per-agent in the UI.


| Variable             | How to get it                                              |
| -------------------- | ---------------------------------------------------------- |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key |
| `CARTESIA_API_KEY`   | [cartesia.ai](https://cartesia.ai) → Settings → API Keys   |


---



#### Anthropic — Claude LLM (optional)

Use Claude instead of GPT for pipeline agents by setting `DEFAULT_LLM_PROVIDER=claude`.


| Variable            | How to get it                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |


---



#### Barge-in / interruption (optional, default off)

Lets callers interrupt the agent mid-sentence. Disable for half-duplex (agent speaks,
then listens) or when background noise causes false triggers.

```ini
BARGE_IN_ENABLED=true          # set to false for half-duplex
BARGE_IN_MIN_VOICE_MS=300      # ms of voice needed to trigger interrupt
BARGE_IN_START_HOLDOFF_MS=400  # ignore barge-in for this long after agent starts speaking
BARGE_IN_BACKOFF_MS=700        # cooldown after an interrupt fires
```

---



#### Phone numbers via Twilio (optional)

Buy a real phone number from the **Phone Numbers** page in the UI — it is attached to
your Elastic SIP Trunk automatically and routed to whichever agent owns the dialled number.


| Variable             | How to get it                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) → Account Info → Account SID |
| `TWILIO_AUTH_TOKEN`  | Same page → Auth Token                                                        |
| `TWILIO_TRUNK_SID`   | Twilio → Elastic SIP Trunking → create a trunk → copy SID (starts with `TK`)  |


Full SIP wiring checklist is in `[.env.example](.env.example)`.

### 3. Configure the web app (~15s)

```bash
cd web && cp .env.local.example .env.local && cd ..
```

The default `BACKEND_URL=http://localhost:3000` is already correct.

### 4. Load the sample data (~10s)

```bash
npm run seed
```



### 5. Run it (~30s)

Two terminals:

```bash
npm run start:dev     # backend  → http://localhost:3000
cd web && npm run dev # frontend → http://localhost:3001
```

Open **[http://localhost:3001](http://localhost:3001)** and press **Talk**. Grant mic access and the agent
greets you. Every call you place shows up under **Calls** within a second of hanging up.

## Sample data

`npm run seed` loads `[sample-data/](sample-data/)` into MongoDB so the dashboard,
analytics and transcript views have something real to show on a fresh clone.


| File                                     | Contents                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `[agents.json](sample-data/agents.json)` | 3 agents — a general assistant and a support agent on the pipeline engine, plus a hotel concierge on Omni |
| `[calls.json](sample-data/calls.json)`   | 9 calls over the last 7 days, 26 conversational turns, 12 tool executions                                 |


The calls are written as readable scenarios (transcript, tool inputs and outputs,
per-stage latency), and the seeder expands each one into the same `calls`,
`call_events` and `conversations` documents a live call produces. Timestamps are
relative to *now*, so the 7-day analytics window is always populated.

Deliberately included so the edge cases are visible in a demo:

- a **failed call** — tool timeout followed by a TTS 502, which lands in the error view
- two **Omni calls** priced per minute against pipeline calls priced per token, so
Cost & Savings has something to compare
- a **no-interaction call** — connected, heard the greeting, hung up without speaking,
which the platform classifies separately from a failure

Re-running is safe: calls are replaced only for the `demo-call-*` IDs the seeder owns,
and an agent that already exists is left exactly as you edited it. To remove the sample
calls:

```bash
npm run seed:clean
```



## Two-minute demo path

1. **Dashboard** — outcome mix, p50/p95 latency and cost per call over 7 days.
2. **Calls →** `demo-call-02` — the transcript with tool executions interleaved at the
  point they fired, and the latency breakdown for each turn.
3. **Calls →** `demo-call-07` — the failed call: tool timeout and provider error captured
  against the exact turn.
4. **Agents → Omni Concierge** — flip the engine, prompt and voice; no redeploy.
5. **Voice Console** — press Talk and have a live conversation. Interrupt it mid-sentence
  to show barge-in (`BARGE_IN_ENABLED=true`).
6. **Analytics** — where the time actually goes: STT vs LLM vs TTS vs unaccounted.



## How it works

```
   Browser (WebRTC)                     Phone (Twilio DID)
         │                                      │
         │  POST /session/start                 │  SIP trunk → dispatch rule
         ▼                                      ▼
   ┌─────────────────────── LiveKit room ───────────────────────┐
   │              media plane for both entry paths              │
   └────────────────────────────┬───────────────────────────────┘
                                │ agent joins, publishes audio
                                ▼
                     ┌──────────────────────┐
                     │  voice-agent module  │  turn detection, barge-in,
                     │  session lifecycle   │  interruption, cleanup
                     └──────────┬───────────┘
                    ┌───────────┴────────────┐
        engine:     ▼                        ▼      engine: omni
   ┌────────────────────────────┐   ┌──────────────────────────┐
   │ STT  →  LLM  →  TTS        │   │  PyAI Omni WebSocket     │
   │ Deepgram  OpenAI  OpenAI   │   │  speech-to-speech,       │
   │ (each provider swappable)  │   │  ~500ms round trip       │
   └────────────┬───────────────┘   └────────────┬─────────────┘
                └──────────────┬─────────────────┘
                               ▼
              orchestration: prompt, tools, guardrails
                               ▼
              MongoDB: calls, events, transcripts, cost
                               ▼
                  Next.js dashboard (REST, port 3001)
```

Both engines write the same call record, so analytics, cost and transcripts work
identically no matter which one an agent uses.

### Modules


| Module                | Responsibility                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| `session`             | Client-facing entry point — mints tokens, creates rooms, starts the agent |
| `voice-agent`         | Session lifecycle, turn detection, barge-in, engine fork                  |
| `livekit`             | Tokens, rooms, RTC audio, webhooks, inbound SIP routing                   |
| `orchestration`       | Prompt assembly, tool calling, conversation state, guardrails             |
| `stt` / `llm` / `tts` | One interface per stage; providers are drop-in                            |
| `agents`              | Agent CRUD, per-agent tool config, first-run seeding                      |
| `call-logs`           | Call records, event timeline, analytics aggregation                       |
| `cost`                | Per-call provider cost from real token/character/second usage             |
| `twilio`              | Search, buy and attach phone numbers to the SIP trunk                     |
| `suggestions`         | AI-proposed prompt and greeting improvements from real transcripts        |




## API tour

Start a session — the client supplies no room name, call ID or token; all three are
generated server-side:

```bash
curl -X POST http://localhost:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{ "agentConfig": { "agentId": "assistant" }, "metadata": { "source": "cli" } }'
```

```json
{
  "serverUrl": "wss://your-project.livekit.cloud",
  "token": "<jwt>",
  "roomName": "voice-2f9c…",
  "callId": "2f9c…",
  "participantIdentity": "user-2f9c…",
  "agentIdentity": "agent-2f9c…"
}
```

Read the results:

```bash
curl 'http://localhost:3000/call-logs?limit=10'            # paginated history
curl  http://localhost:3000/call-logs/demo-call-02/transcript
curl 'http://localhost:3000/call-logs/stats?period=7'      # dashboard aggregates
curl 'http://localhost:3000/call-logs/latency?period=7'    # percentiles + stage split
curl  http://localhost:3000/agents
```



## Phone numbers

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_TRUNK_SID`, then buy a number
from the **Phone Numbers** page. It is attached to your Elastic SIP Trunk automatically.
Point the trunk at LiveKit SIP, set `LIVEKIT_SIP_ENABLED=true` with the trunk and
dispatch rule IDs, and inbound calls route to the agent that owns the dialled number —
the full setup checklist is in `[.env.example](.env.example)`.

## Project structure

```
src/                     NestJS backend
├── session/             client entry point
├── voice-agent/         lifecycle, turn detection, engines/
├── livekit/             tokens, rooms, RTC, webhooks, SIP
├── orchestration/       prompt, tools, state, guardrails
├── stt/ llm/ tts/       swappable providers
├── agents/              agent + tool configuration
├── call-logs/           records, events, analytics
├── cost/                per-call cost accounting
├── recording/           mixed WAV capture
├── twilio/              number provisioning
└── persistence/         memory or MongoDB, chosen by env

web/                     Next.js 15 dashboard + voice console
sample-data/             seedable demo agents and calls
scripts/                 seed-sample-data.mjs
docs/                    architecture and runtime flow notes
```



## Scripts


| Command              | Description                      |
| -------------------- | -------------------------------- |
| `npm run start:dev`  | Backend with hot reload          |
| `npm run seed`       | Load `sample-data/` into MongoDB |
| `npm run seed:clean` | Remove the sample data           |
| `npm run build`      | Compile TypeScript               |
| `npm run lint`       | ESLint                           |




## Known limits

- `PERSISTENCE_PROVIDER=memory` keeps everything in process — restart and history is gone.
Use `mongodb` for anything you want to look at twice.
- Recordings are written to local disk (`recordings/`), not object storage.
- There is no auth in front of the API yet; run it on localhost or behind your own gateway.



## LICENSE

[MIT](https://github.com/odysseus-aiva/OdysseusAI/blob/main/LICENSE)