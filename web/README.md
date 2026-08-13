# OdysseusAI Web

The web interface for the OdysseusAI voice agent platform. Phase 1 is a one-click
voice experience; the architecture is built to grow into history, analytics,
multi-agent, and admin modules without a rewrite.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (design tokens in `src/app/globals.css`)
- **Motion** (Framer Motion) for state-driven animation
- **@livekit/components-react** + **livekit-client** for realtime voice
- **Zustand** for app-level session state, **Zod** for runtime validation

## Getting started

```bash
cp .env.local.example .env.local   # set BACKEND_URL to your NestJS server
npm install
npm run dev                        # http://localhost:3001
```

The backend (NestJS) must be running (default `http://localhost:3000`) with
LiveKit credentials configured in its `.env`.

## How it works

1. Click **Talk** → `POST /api/session/start` (Next BFF route).
2. The BFF proxies to the backend's `POST /session/start`, which creates the
   room, mints a token, and starts the server-side agent (non-blocking).
3. The returned envelope drives `<LiveKitRoom>`; the mic publishes and the
   agent's audio plays via `<RoomAudioRenderer>`.
4. The agent publishes `lk.agent.state`; `useVoiceAssistant` reads it and the
   `AiCore` animates through listening / thinking / speaking.

No tokens, URLs, or manual room joins are ever exposed to the user.

## Structure

```
src/
├── app/              # routes + BFF (api/session/start)
├── features/voice/   # all Phase 1 voice logic (components, hooks, state)
├── components/ui/    # reusable presentational primitives
└── lib/              # env, api client, livekit config
```

Future modules (`features/history`, `features/analytics`, …) slot in as
siblings of `features/voice`.
