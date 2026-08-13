# Claude Handoff — Synaptic Voice Agent Studio (PyAI Hackathon)

Dense state snapshot for a fresh session. Pairs with `AUTOPILOT_PROGRESS.md` (fuller history) and `NEXT_BUILD_PRIORITIES.md` (older, partly stale). This file wins on conflicts.

## 1. Objective & success criteria
Ship a polished open-source Voice Agent Studio for the PyAI Hackathon: keep the working LiveKit modular pipeline **and** add PyAI Omni as an alternative engine, selectable per-agent. 
**Immediate success gate:** an agent with `engine: 'omni'` connects to PyAI Omni and the user **hears the agent speak** in a real browser call, with mic → transcript → agent audio all flowing. This is the one unmet criterion (see §6).
**Broader:** pipeline stays the reliable default; Omni is additive; tools + observability work across both engines.

## 2. Key decisions (why)
- **Engine is a per-agent field** (`AgentEngine = 'pipeline' | 'omni'`, default `pipeline`) — not a global mode. Threaded through schema→types→DTO→resolver→`AgentConfig`.
- **Single fork point:** `VoiceAgentService.startSession` branches after config assembly (`src/voice-agent/voice-agent.service.ts:177`). Everything above (call log, cost, perf, session) is engine-agnostic and shared.
- **LiveKit stays the transport for both engines.** Omni does NOT own audio transport; it rides LiveKit (room/token/mic-in/speaker-out). Verified LiveKit RTC is a clean PCM in/out abstraction.
- **Omni fallback → pipeline** on any bring-up failure, so a PyAI outage never kills a call.
- **PyAI Hear/Speak are ordinary providers** (drop into existing `Map<name,provider>` in `stt.service`/`tts.service`). Omni is NOT a provider (it fuses STT+LLM+TTS) — it's a separate engine.
- **Tools cross both engines** via one path: `ToolRegistryService.listForOmni()` exposes schemas; Omni `tool_call` runs through the same `ToolExecutionService`.
- **Docs were wrong repeatedly** — protocol was reverse-engineered from live WS probes with the sandbox key. Trust the code/live behavior over PyAI docs.

## 3. Work completed (files)
- **Engine abstraction (P0-1):** `src/agents/interfaces/agent.types.ts` (`AgentEngine`, `DEFAULT_AGENT_ENGINE`), `src/persistence/mongo/schemas/agent.schema.ts` (`engine?`), `mongo-agent.repository.ts` + `repositories/in-memory-agent.repository.ts` (`normalizeEngine`), `agents.service.ts` (`resolveForSession`), `agent-tool-resolver.service.ts`, `dto/agents.dto.ts` (`@IsIn`), `common/types/voice-agent.types.ts` (`AgentConfig.engine`).
- **PyAI providers (P0-2):** `src/stt/providers/pyai-hear.provider.ts`, `src/tts/providers/pyai-speak.provider.ts`, registered in `stt.module.ts`/`stt.service.ts` + `tts.module.ts`/`tts.service.ts`. Config block `pyai:{apiKey,baseUrl}` in `src/config/configuration.ts`.
- **Omni engine (P0-3) + fallback (P0-5):** `src/voice-agent/engines/omni-engine.service.ts` (WS bridge, tool handshake, event→call-log mirror, bounded reconnect). Wired in `voice-agent.service.ts` (`connectOmniToRoom` at :381, fork at :177, teardown in `stopSession`). Registered in `voice-agent.module.ts`.
- **Streaming audio path:** `LivekitRtcService.enqueuePcm()` (`src/livekit/livekit-rtc.service.ts:360`) — continuous append for Omni, distinct from `publishPcm` (whole-utterance, aborts prior).
- **First-run (P0-4):** `src/agents/agent-seeder.service.ts` seeds `Sample Assistant` + 4 tools when DB empty (idempotent).
- **Frontend:** engine chooser + Omni panel in `web/src/features/agents/components/VoiceTab.tsx` (`EngineCard`); engine tile in `OverviewTab.tsx`; engine badge/chip in `AgentCard.tsx`; `engine` in `web/src/lib/api/agents.ts` (schema+update body) and `useAgentConfig.ts` (draft+save); `pyai` in `features/agents/providers.ts`.
- **Diagnostics (latest):** Omni engine logs first-frame-per-tag, `▶ agent AUDIO started`, `◀ mic audio streaming`, transcript lines; `enqueuePcm` logs `[omni-audio]` frame/sample/peak every 1s.

## 4. Repo state
- **Not a git repo** (no version control; changes are on disk only).
- Backend `npm run build` clean; frontend `npm run typecheck` clean (verified now).
- `.env`: `PERSISTENCE_PROVIDER=mongodb`, real PyAI sandbox key present (`PYAI_API_KEY`, `pyai_test_…`).
- Mongo has real agents incl. `rohit-personal` (currently `engine:omni`, `voiceId:onyx`) and likely `omni-agent`.
- No dev servers currently running (killed).

## 5. Work still required (priority)
1. **Confirm Omni end-to-end audio in a real browser call** (the success gate). All known framing bugs fixed but not yet proven with a live voice — headless probes can't emit speech.
2. Verify `transcript`/`tool_call` frame shapes against real traffic (coded defensively from docs; unconfirmed live). Adjust field names if logs differ.
3. P1 — Live Voice screen realtime state wired to orb (both engines); replace `web/src/app/(shell)/live/page.tsx` ComingSoon.
4. P1 — Call Detail engine badge + per-engine caveats.
5. P1-7 — `GET /health` + LLM retry/backoff.
6. P2 — Engine Compare (pipeline vs Omni, same agent).

## 6. Bugs / blockers / failed approaches (do NOT repeat)
- **THE open issue:** Omni still reported silent by user on last real call. Four sequential root causes found & fixed (mic tag, configure framing, audio-out tag, frame shredding — see below). Latest fix (`enqueuePcm`) not yet user-verified. If still silent, read the new diagnostic logs first — they pinpoint the failing stage.
- **PyAI Omni real protocol** (live-verified, docs are WRONG): endpoint `wss://api.pyai.com/v1/omni?format=pcm16&rate=16000&api_key=…`. **Asymmetric binary tags:** mic→server `0x01`, server→client audio `0x02`, control both ways `0x03` (JSON keyed on `event`, `type` fallback). Audio in 16k, out 24k.
- **Failed approach 1:** treating all frames as one tag `0x03` — wrong, dropped everything.
- **Failed approach 2:** sending `configure` as plain-text JSON — silently dropped by server; MUST be `0x03`-framed binary (server then replies `{"event":"configured"}`).
- **Failed approach 3:** assuming agent audio = `0x01` — it's `0x02`; receive handler now treats any non-`0x03` binary as audio.
- **Failed approach 4:** routing Omni audio through `publishPcm` — it aborts/clears/waits per call, shredding Omni's many tiny frames (`Streaming 3 samples … 0 samples`). Fixed with `enqueuePcm` (append-only). **Do not send streaming realtime audio through `publishPcm`.**
- Confirmed-live events: `hello`, `session_started`, `configured`, `idle_prompt`, `audio_position`. Greeting audio does NOT auto-emit in headless probes (needs real listener/speech).
- **Greeting timing:** Omni speaks turn-0 on configure; `configure` is deferred to `onListenerReady` (`OmniHandle.start()`) so it isn't lost to an empty room. Don't move it back to socket-open.

## 7. Commands
- Backend build: `npm run build` · dev: `npm run start:dev` (port 3000) · lint: `npm run lint`
- Frontend (in `web/`): `npm run typecheck`, `npm run dev` (port 3001), `npx next lint --dir src`
- Force empty store to test seeder: `PERSISTENCE_PROVIDER=memory npm run start:dev`
- Free stuck port: `lsof -ti:3000 | xargs kill -9`
- Start session (fire-and-forget; agent bring-up is async, watch logs): `curl -X POST localhost:3000/session/start -H 'Content-Type: application/json' -d '{"agentConfig":{"agentId":"omni-agent"}}'`
- Live Omni WS probe pattern (used to reverse-engineer protocol): standalone `node -e` script reading `PYAI_API_KEY` from `.env`, connect, send `0x03`-framed configure, log inbound frame tags. Synthetic audio never triggers a spoken reply — only real speech does.

## 8. Architectural constraints & user prefs
- **Not a rewrite.** Build on existing abstractions (providers, orchestrator, tools, persistence, call-logs, cost). All were sound.
- Provider selection = DI `Map<name,provider>` per modality; add a provider = implement interface + one Map entry.
- Dual persistence (in-memory / mongo) — any repo interface change must update BOTH repos.
- Pipeline path must stay byte-identical for existing agents (default engine).
- Frontend: `immersive-ui-design` + `dataviz` skills govern UI; dark theme, cyan accent, Space Grotesk; the orb is the signature element; use CSS tokens (`var(--color-*)`), no new deps, respect reduced-motion. `impeccable` hook runs on writes.
- User works in caveman-mode terse style; wants verification (live tests/screenshots), not claims. Report failures honestly.
- Autopilot norm: maintain `AUTOPILOT_PROGRESS.md`; don't ask approval for routine decisions.

## 9. Assumptions to verify
- Omni `transcript` frame uses `{role,text,final}` and `tool_call` uses `{call_id,tool,arguments}` — from docs, NOT seen live. Confirm via logs on a real call; handlers accept aliases (`name`) but field names may differ.
- Omni `tool_result` reply shape `{event:'tool_result',call_id,result|error}` unconfirmed live.
- `rohit-personal` is `engine:omni` — may be unintended (set via a UI save). Confirm with user; flip to pipeline if wrong.
- Secret hygiene: real sandbox key sits in `.env.example` — before repo is ever committed, blank it there (keep only in `.env`).

## 10. Single best next action
Have the user place one real browser voice call on an Omni agent, then read the new diagnostic logs in order: `◀ mic audio streaming to Omni` → `Omni transcript [user/final]` → `▶ Omni agent AUDIO started (0x02)` → `[omni-audio] … peak=`. Whichever line is missing is the exact failing stage. If `[omni-audio]` shows `peak > 100` but no sound, the bug is downstream in LiveKit playout/`enqueuePcm` framing; if agent-AUDIO never starts, it's Omni-side (config/turn detection); if transcript never appears, mic audio isn't reaching Omni.
