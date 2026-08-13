# Web App Architecture — OdysseusAI Voice Agent Platform

> The web app is the primary interface for the voice agent platform. Phase 1 delivers a
> polished one-click voice experience. The architecture is designed so that conversation
> history, analytics, multi-agent selection, transcripts, tool-execution timelines, and an
> admin dashboard can be added later **without a rewrite**.

---

## 1. Context: the existing backend

The backend is a **NestJS** application that runs a **fully server-side voice agent**. It does
**not** use the LiveKit *Agents* framework — it drives the pipeline itself with
`@livekit/rtc-node`:

```
User mic ──► LiveKit room ──► rtc-node (agent) ──► STT (Deepgram)
                                                      │
                                              Turn detection
                                                      │
                                          Orchestrator (LLM + tools)
                                                      │
                                              TTS (ElevenLabs / OpenAI / Cartesia)
                                                      │
User speaker ◄── LiveKit room ◄── agent-voice track ◄─┘
```

The agent joins each room as a participant with identity `agent-${callId}` and publishes an
audio track named `agent-voice`. The **authoritative voice state** (`connecting`, `listening`,
`processing`, `speaking`, `error`) lives on the backend session object.

### Existing HTTP APIs

| Method | Path                              | Purpose                                            |
| ------ | --------------------------------- | -------------------------------------------------- |
| `POST` | `/livekit/token`                  | Mint an access token for a room + participant.     |
| `POST` | `/voice-agent/start`              | Start the server-side agent for a room.            |
| `GET`  | `/voice-agent/session/:roomName`  | Fetch session + logs + latency metrics.            |
| `POST` | `/livekit/webhook`                | LiveKit server webhooks (participant join/leave).  |

### Why the frontend cannot use these as-is

1. **No single entry point.** A one-click UX must not make the browser invent a `roomName`
   and `callId`, then chain `/livekit/token` + `/voice-agent/start`. That leaks orchestration
   detail into the client — exactly what Phase 1 forbids.
2. **Start is blocking.** `connectAgent` awaits `waitForSubscription()`, which only resolves
   once a *listener* (the browser) joins. But the browser needs the token that
   `/voice-agent/start` would return → **deadlock**. The agent bring-up must run in the
   background so the endpoint returns the token immediately.
3. **State is invisible to LiveKit.** Rich UI states (`thinking`, `speaking`) are only on the
   server session. The client would have to poll. Instead we publish state as **agent
   participant attributes** so it streams over LiveKit's existing signaling.

### Backend additions (implemented alongside this doc)

- **`POST /session/start`** — one call that: ensures the room exists, mints the user token,
  kicks off the server agent **non-blocking**, and returns everything the client needs.
- **`SessionService.publishState()`** — sets `lk.agent.state` (and `lk.agent.*` metadata) on
  the agent participant via `RoomServiceClient.updateParticipant`, so `useVoiceAssistant`
  reports true state with zero polling.

```jsonc
// POST /session/start  → response
{
  "serverUrl": "wss://…livekit.cloud",
  "token": "<user JWT>",
  "roomName": "voice-<uuid>",
  "callId": "<uuid>",
  "participantIdentity": "user-<uuid>",
  "agentIdentity": "agent-<callId>"
}
```

The browser only ever sees this opaque envelope. No token copying, no URLs, no manual joins.

---

## 2. Tech stack & rationale

| Concern            | Choice                                        | Why                                                                                             |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Framework          | **Next.js 15 (App Router)**                   | Server routes hide backend base URL/secrets from the browser; RSC + file-based routing scales to future dashboard pages. |
| Language           | **TypeScript (strict)**                       | End-to-end types shared with backend contracts.                                                 |
| Styling            | **Tailwind CSS v4**                           | Design-token driven, no hardcoded values, tiny runtime.                                         |
| Animation          | **Framer Motion (`motion`)**                  | Declarative state-transition animations for the AI core and state changes.                      |
| Realtime / voice   | **`@livekit/components-react` `livekit-client`** | Official SDK; `useVoiceAssistant`, `RoomAudioRenderer`, `BarVisualizer` remove reams of WebRTC glue. |
| LiveKit styles     | **`@livekit/components-styles`**              | Base styles for components we adopt (kept minimal / overridden).                                |
| State (client)     | **Zustand**                                   | Tiny, unopinionated store for connection/session state that lives outside LiveKit's context.    |
| Data fetching      | **Native `fetch` in Next route handlers**     | No heavy client; add TanStack Query later when history/analytics need caching.                  |
| Validation         | **Zod**                                       | Runtime-validate the `/session/start` envelope; single source of truth for API types.           |

**Verified current versions (mid-2026):** `livekit-client@^2.20`, `@livekit/components-react@^2.9`,
`@livekit/components-styles@^1.2`. We deliberately use `useVoiceAssistant` + `RoomAudioRenderer`
(current API) rather than the deprecated manual `RoomProvider`/track-subscription patterns.

### Why not the LiveKit *Agents* JS starter verbatim

The official starter assumes the *Agents framework* worker. This backend is a **custom
rtc-node agent**, so we adopt the framework's **client conventions** (attributes-based state,
`useVoiceAssistant`, `RoomAudioRenderer`) while pointing the connection at *our* `/session/start`.
Best of both: idiomatic frontend, our orchestration.

---

## 3. Folder structure

```
web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout, fonts, ambient background
│   │   ├── page.tsx                  # Phase 1: the single voice screen
│   │   ├── globals.css               # Tailwind + design tokens (CSS vars)
│   │   └── api/
│   │       └── session/
│   │           └── start/route.ts    # BFF proxy → backend POST /session/start
│   │
│   ├── features/                     # Feature-isolated modules (the scalability seam)
│   │   └── voice/                    # ⬅ ALL Phase 1 voice logic lives here
│   │       ├── components/
│   │       │   ├── VoiceExperience.tsx    # Orchestrates connection + room
│   │       │   ├── VoiceRoom.tsx          # Inside RoomContext; wires hooks → UI
│   │       │   ├── AiCore.tsx             # The animated central orb
│   │       │   ├── TalkButton.tsx         # One-click entry control
│   │       │   ├── AudioControls.tsx      # Mute / disconnect / reconnect
│   │       │   └── StatusReadout.tsx      # Connection + speaking/listening chips
│   │       ├── hooks/
│   │       │   ├── useVoiceSession.ts     # start/stop lifecycle + Zustand glue
│   │       │   └── useAgentVoiceState.ts  # maps LiveKit agent state → VoiceState
│   │       ├── state/
│   │       │   └── voice.store.ts         # Zustand store (connection phase, errors)
│   │       └── types.ts                   # VoiceState union, view models
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts             # typed fetch wrapper (base URL, errors)
│   │   │   └── session.ts            # startSession() → typed envelope (Zod)
│   │   ├── livekit/
│   │   │   └── config.ts             # room connect options, audio presets
│   │   └── env.ts                    # validated env (server vs public)
│   │
│   ├── components/ui/                # Reusable, presentational primitives
│   │   ├── GlassPanel.tsx
│   │   ├── GlowButton.tsx
│   │   └── Particles.tsx             # Ambient background particle field
│   │
│   └── styles/
│       └── tokens.css                # Color / blur / glow design tokens
│
├── .env.local.example                # BACKEND_URL, NEXT_PUBLIC_APP_NAME…
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Guiding rule:** anything voice-specific is under `features/voice/`. Future modules
(`features/history/`, `features/analytics/`, `features/agents/`) slot in as siblings without
touching voice code. Presentational primitives (`components/ui/`) and platform glue (`lib/`)
are shared.

---

## 4. Connection flow (one-click)

```
┌──────────┐   click    ┌───────────────────┐   POST    ┌──────────────────────┐
│ TalkButton│──────────►│ useVoiceSession    │──────────►│ /api/session/start   │ (Next BFF)
└──────────┘            │ (request mic perm) │           └──────────┬───────────┘
                        └───────────────────┘                       │ proxy
                                                                     ▼
                                                        ┌──────────────────────┐
                                                        │ NestJS /session/start │
                                                        │  • ensure room         │
                                                        │  • mint user token     │
                                                        │  • start agent (async) │
                                                        └──────────┬───────────┘
                                    { serverUrl, token, roomName }  │
                        ┌───────────────────┐  ◄───────────────────┘
                        │ LiveKitRoom /      │  room.connect(serverUrl, token)
                        │ RoomContext        │  + publish mic track
                        └─────────┬─────────┘
                                  │  agent joins, publishes `agent-voice`
                                  ▼
                        ┌───────────────────┐   RoomAudioRenderer plays agent audio
                        │ useVoiceAssistant  │   agent attributes → VoiceState
                        └───────────────────┘   AiCore animates to match
```

Zero manual steps after the single click. Mic permission is requested by the browser as part
of publishing the local track; the connection, agent bring-up, and audio rendering are
automatic.

---

## 5. Voice state model

A single canonical union drives every animation. LiveKit's agent state and local connection
state are **mapped into it** so the UI never branches on transport details.

```ts
type VoiceState =
  | 'idle'          // pre-connect; ambient breathing
  | 'connecting'    // token + room join in flight
  | 'listening'     // agent idle, user may speak
  | 'thinking'      // agent processing (LLM/tools)
  | 'speaking'      // agent audio playing
  | 'disconnected'  // clean end
  | 'error';        // failure; retry affordance
```

| Source                                   | Maps to                                        |
| ---------------------------------------- | ---------------------------------------------- |
| Local `ConnectionState` (livekit-client) | `connecting` / `disconnected`                  |
| `useVoiceAssistant().state` (attributes) | `listening` / `thinking` / `speaking`          |
| Session `start` rejection / room error   | `error`                                        |
| No session yet                           | `idle`                                         |

The backend publishes `lk.agent.state` as `listening → thinking → speaking → listening`
around each turn (see §1). This is the same attribute `useVoiceAssistant` reads for
Agents-framework agents, so the client code is idiomatic and forward-compatible.

---

## 6. Component hierarchy

```
<RootLayout>                       ambient particles + gradient backdrop
 └─ <Page>
     └─ <VoiceExperience>          owns connection lifecycle (no LiveKit ctx yet)
         ├─ <TalkButton>           idle → triggers useVoiceSession.start()
         └─ <LiveKitRoom>          (RoomContext provider) — mounted once connected
             └─ <VoiceRoom>
                 ├─ <RoomAudioRenderer/>   plays all remote audio (agent-voice)
                 ├─ <AiCore state=…/>      central animated orb, driven by VoiceState
                 ├─ <StatusReadout/>       connection + listening/speaking chips
                 └─ <AudioControls/>       mute / disconnect / reconnect
```

- **Business logic** lives in hooks/stores (`useVoiceSession`, `useAgentVoiceState`,
  `voice.store`). Components are declarative and receive a `VoiceState` + callbacks.
- `AiCore` is pure/presentational: it takes `state` and renders the matching animation. Swapping
  the orb for a waveform later touches one file.

---

## 7. State management

- **LiveKit runtime state** (participants, tracks, agent state) → LiveKit React context +
  hooks. We never duplicate it.
- **App/session state** (connection phase, last error, current `callId`, mic-muted) →
  **Zustand** store in `features/voice/state`. Small, synchronous, testable.
- **Server data** (future: history, logs, analytics) → Next route handlers now; introduce
  **TanStack Query** when caching/refetching matters. Not needed for Phase 1.

Separation keeps voice logic swappable and prevents a monolithic global store.

---

## 8. Future expansion strategy (designed-for, not built)

| Future module            | How it slots in                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Conversation history     | `features/history/`; backend already persists call logs (Mongo/in-memory) → add `GET /calls`.       |
| Session replay           | Reuse `AiCore` + a transcript timeline fed by stored `call-events`.                                 |
| Call logs / analytics    | Dashboard routes under `app/(dashboard)/`; TanStack Query against new read APIs.                    |
| Multiple agents + selector | `AgentConfig` already supports `agentId`; add agent picker → pass `agentId` into `/session/start`.  |
| Prompt editor            | `systemPrompt` is already a per-session config field.                                               |
| Tool-execution timeline  | Backend already logs `tool` events; publish them as LiveKit data messages → live timeline.          |
| Transcript viewer        | `useVoiceAssistant` exposes `agentTranscriptions`; add STT partials via data channel.               |
| Performance metrics       | `GET /voice-agent/session/:room` already returns `latencyMetrics`.                                  |
| Auth                     | Wrap Next middleware; BFF route attaches user identity to `/session/start`.                         |
| Dark/light themes        | All colors are CSS design tokens in `tokens.css`; theme = swap token set.                           |

The **feature-folder + BFF + design-token** structure is the core of forward-compatibility:
new capabilities are new folders and new read endpoints, never a refactor of the voice core.

---

## 9. Design language (UI theme)

Futuristic, minimal, premium — an "AI operating system," not cyberpunk clutter.

- **Palette:** deep space background, glass surfaces, a single neon accent gradient
  (cyan→violet), soft ambient glow. All via CSS variables in `styles/tokens.css`.
- **AI Core:** a breathing sphere with layered radial gradients + animated noise/particles.
  Each `VoiceState` has a distinct, smoothly-interpolated animation (idle breathing, listening
  ripples, thinking swirl, speaking amplitude pulse).
- **Motion:** Framer Motion `AnimatePresence` for state transitions; springs, not linear
  tweens. Subtle throughout — nothing abrupt.
- **Glassmorphism:** `GlassPanel` primitive (backdrop-blur + subtle border + inner glow).
- **Accessibility:** state also communicated by text (`StatusReadout`) and honors
  `prefers-reduced-motion`.
