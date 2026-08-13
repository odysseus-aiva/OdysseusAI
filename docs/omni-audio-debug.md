# PyAI Omni Audio — Root Cause & Fix

## Symptom

Agent connected to room, mic audio streamed to Omni, transcript tokens arrived, but **no audio was heard** in the browser. `turns=0`, `llm=$0`, session ended silently.

---

## Root Cause Chain (in order discovered)

### 1. Wrong tag mapping (critical)

Previous code assumed an asymmetric tag scheme reverse-engineered from early probes:
```
client→server: mic audio = 0x01
server→client: agent audio = 0x02
both:           control JSON = 0x03
```

**Actual protocol** (from `/realtime/omni-protocol` docs):
```
0x01 = audio  (both directions — mic client→server, agent audio server→client)
0x02 = streaming transcript tokens (raw UTF-8, NOT JSON, server→client)
0x03 = control/lifecycle events JSON (both directions)
```

The code was routing transcript UTF-8 bytes through `JSON.parse` (→ "Unparseable" warnings) and routing real `0x01` audio frames — which turned out to be error JSON — through the audio playback path.

### 2. Invalid voice ID (`alloy` is OpenAI-only)

Configure frame was sending `voice_id: "alloy"`. PyAI does not have this voice. Instead of rejecting the session, Omni sends a JSON error **on the `0x01` audio tag**:

```
{"detail":"voice_not_found"}
```

28 bytes. This was being passed directly to `captureFrame()` as PCM16, producing garbage (`peak=32034` came from `0x7d22` = `}"` interpreted as a little-endian int16).

The `hello` frame always reveals the server's valid default: `"voice_id": "stock_sarah_style2"`.

### 3. `configure` used `type` field (minor)

Frame was sent as `{"type":"configure",...}`. Docs specify `{"event":"configure",...}`. Server accepted both, so not a blocker — but fixed for protocol correctness.

### 4. `greeting: ""` sent explicitly (minor)

Empty string was included in configure. Omni interprets this as `greeting: false` and suppresses turn-0 speech. Fixed to omit the field when empty.

---

## Fixes Applied

| File | Change |
|------|--------|
| `omni-engine.service.ts` | Tag constants corrected: `AGENT_AUDIO_TAG=0x01`, `TRANSCRIPT_TAG=0x02`, `CONTROL_TAG=0x03` |
| `omni-engine.service.ts` | `0x02` handler: log raw UTF-8 tokens instead of JSON.parse |
| `omni-engine.service.ts` | `0x01` handler: detect leading `{` → route to control/error handler instead of audio |
| `omni-engine.service.ts` | Default voice: `'alloy'` → `'stock_sarah_style2'` |
| `omni-engine.service.ts` | Configure event key: `type: 'configure'` → `event: 'configure'` |
| `omni-engine.service.ts` | Omit `greeting` field when empty instead of sending `""` |
| `omni-engine.service.ts` | Added `{"detail":"..."}` error frame handler (logs at ERROR level) |
| MongoDB | `rohit-personal` agent `voiceId`: `onyx` → `stock_sarah_style2` |

---

## Valid PyAI Voice IDs

The `hello` frame always reports the server's resolved default:
```json
"voice_id": "stock_sarah_style2"
```

Use voices from the PyAI voice catalog, not OpenAI names (`alloy`, `onyx`, `echo`, `nova`, etc.). If an invalid voice is sent, Omni sends `{"detail":"voice_not_found"}` on the `0x01` tag — now detected and logged as an ERROR.

---

## How to Diagnose Silence in Future

Check these log lines in order:

1. `Omni hello (FULL):` — confirms `audio_out` rate and valid `voice_id`
2. `Omni sending configure:` — verify `voice_id` is a PyAI voice, not OpenAI
3. `Omni configured (FULL):` — confirms `greeting: true/false`, `voice_id` applied
4. `Omni server error:` — if this appears, Omni rejected something in configure
5. `Omni transcript token (0x02)` — agent is generating text (LLM working)
6. `▶ Omni audio frame #1` — first real PCM16 arriving (if missing after transcript tokens, audio tag routing is broken)
7. `[omni-audio] first captureFrame:` — audio reached LiveKit

If steps 5 fires but step 6 never does → check for `Omni server error: voice_not_found` or similar on `0x01` tag.

---

## Protocol Reference

Full wire spec: `https://docs.pyai.com/realtime/omni-protocol`

Key facts:
- `rate=` URL param controls **input** sample rate (16000 recommended, matches LiveKit mic)
- `audio_out` in `hello`/`configured` shows actual output rate (always 24000 for WebRTC)
- `0x02` frames are **streaming text tokens**, not JSON objects — accumulate to read full sentences
- Error objects `{"detail":"..."}` arrive on `0x01` tag, not `0x03`
