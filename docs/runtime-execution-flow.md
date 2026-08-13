# Runtime Execution Flow — Default Pipeline vs PyAI Omni

All code paths start from `VoiceAgentService`. The two engines share session bookkeeping, call-log infrastructure, cost tracking, and LiveKit RTC transport. They diverge at the engine fork in `startSession` and rejoin at `stopSession`.

---

## Part 1 — Session Startup (shared, both engines)

### Step 1 · HTTP request arrives

`POST /voice-agent/start` hits `VoiceAgentController`, which calls `VoiceAgentService.startSession(roomName, callId, agentConfig?, metadata?)`.

**Fail path:** If a session for `roomName` already exists in the in-memory `sessions` Map → throws `ConflictException`. No retry. Caller gets 409.

---

### Step 2 · Agent config resolution (`AgentToolResolverService.resolve`)

- If `agentConfig.agentId` is present: loads the agent record from `AgentsService` (Mongo or in-memory), merges DB values with request overrides. Request-level `enabledTools` can only restrict, never expand the DB assignment. `toolConfigs` is built per-tool from the DB assignment's stored config.
- If no `agentId`: uses the partial config as-is; no DB lookup.
- Provider cascade: request override → DB value → `ConfigService` default (`providers.stt/llm/tts` env vars).
- TTS provider special case: if configured provider is `elevenlabs` but no `ELEVENLABS_API_KEY` is set → falls back to `openai`.
- STT cost seed: `CostService.setSttProvider(callId, sttProvider)` called here.

**Fail path:** If `agentId` is set but the agent record doesn't exist in the repository → `NotFoundException` propagates. Session not created.

---

### Step 3 · Session object created

In-memory `VoiceAgentSession` created with status `'connecting'`. `conversationHistory` seeded with system prompt if present.

Logged to call store:
- `callLogsService.initCall(callId, roomName, agentId, agentSnapshot, metadata)`
- `appendLog: session_start`
- `appendLog: agent_config_loaded` (providers, voiceId, language, enabledTools)

`ActiveSessionContext` registered in `sessions` Map. `responseGenerationId = 0`, `turnCount = 0`.

---

### Step 4 · Engine fork

```
config.engine ?? DEFAULT_AGENT_ENGINE
        │
        ├── 'omni'  →  connectOmniToRoom()
        │                  └── on false return → fallback → connectAgentToRoom()
        └── 'pipeline' (default)  →  connectAgentToRoom()
```

After either path completes, `setStatus(context, 'listening')` is called and the session is returned to the caller.

---

## Part 2 — PyAI Omni Engine

### Step 5-O · ConversationState created

`conversationStateService.getOrCreate(callId, roomName, agentId, ...)` creates a durable `ConversationState` keyed by `callId`. This stores `transcriptHistory`, `toolCallHistory`, `llmMessages` — the same structure the pipeline uses. Without this, `GET /call-logs/:callId/transcript` returns nothing.

---

### Step 6-O · Omni WebSocket opened (`OmniEngineService.connect`)

1. Checks `PYAI_API_KEY` — if absent, throws immediately. Caller (`connectOmniToRoom`) catches the throw, logs warning, returns `false` → pipeline fallback.
2. Builds WebSocket URL: `wss://api.pyai.com/v1/omni?format=pcm16&rate=16000&api_key=...`
3. `openSocket(url, callId)`:
   - Creates `new WebSocket(url)`.
   - 8-second timer (`CONNECT_TIMEOUT_MS = 8000`). If socket does not reach OPEN within 8s → `socket.terminate()` → rejects with `'Omni connect timed out'`.
   - On `open`: clears timer, resolves with the socket.
   - On `error`: clears timer, rejects with the socket error.

**Fail path:** Timeout or network error → `connectOmniToRoom` catches → logs warn → returns `false` → pipeline fallback activated.

---

### Step 7-O · Frame handlers wired (`wireHandlers`)

Message router registered on the socket. All incoming binary frames are routed by tag byte:

| Tag | Meaning | Handler |
|-----|---------|---------|
| `0x03` | Control JSON (lifecycle, transcripts, tool calls) | `handleControl()` |
| `0x02` | Streaming transcript tokens (raw UTF-8) | Logged as `transcript token (0x02)` — no further action |
| `0x01` | Agent audio PCM16 — but if first byte is `0x7b` (`{`), it's an error JSON | If `{` → route to `handleControl`; else → `callbacks.onAudioOut(payload)` |
| Unknown | Any other tag | Logged WARN with hex preview |

Close handler:
- `closedByUs = true` (set by `stop()`) → silently ignored.
- Close code in `FATAL_CLOSE_CODES` (4401, 4403) → `callbacks.onFatalError(...)` immediately. No retry.
- Other codes → bounded exponential backoff reconnect:
  - Attempts: `MAX_RECONNECT_ATTEMPTS = 2`
  - Delay: `min(1000 * 2^attempt, 8000)` ms
  - Reconnect opens a new socket, wires handlers, re-sends the `configure` frame.
  - If reconnect `openSocket` fails → `callbacks.onFatalError(...)`.
  - After `reconnectAttempts >= MAX_RECONNECT_ATTEMPTS` → `callbacks.onFatalError(...)`.

Error handler: logs `ERROR` level. Does not close the session — socket may recover.

---

### Step 8-O · OmniHandle returned to `connectOmniToRoom`

`handle = { start, writeAudio, stop }` stored in `context.omni`.

`callbacks` registered:
- `onAudioOut(pcm)` → `livekitRtcService.enqueuePcm(roomName, pcm, OMNI_OUTPUT_RATE)` — streaming append, no abort.
- `onStatus(status)` → `setStatus(context, status)` → updates session, publishes `lk.agent.state` to LiveKit room.
- `onBargeIn()` → if `BARGE_IN_ENABLED=true`: `livekitRtcService.stopPlayback(roomName)`. If `false`: no-op.
- `onSessionEnd()` → `stopSession(roomName, 'agent')`.
- `onFatalError(message)` → sets `session.error`, calls `stopSession(roomName, 'error')`.
- `onTranscript(event)` → if `isFinal`: pushes to `convState.transcriptHistory`, saves state.
- `onToolExecuted(event)` → pushes to `convState.toolCallHistory`, accumulates `pendingToolNames`, saves state.

---

### Step 9-O · LiveKit RTC connected

`livekitRtcService.connectAgent(roomName, agentIdentity, onAudioChunk, onListenerReady, onParticipantDisconnected)`:

- Agent mints a LiveKit access token (server-side, never exposed to client).
- Connects to the LiveKit room. Publishes a local audio track (`agent-voice`).
- `onListenerReady` (fires when browser subscribes to agent track) → `handle.start()` → sends the `configure` frame to Omni. Deferred to this point so the greeting audio plays into an occupied room.
- `onAudioChunk(pcm)` (fires per LiveKit audio frame from the user's mic) → `active?.omni?.writeAudio(pcm)`. If session no longer active or not yet configured: silently dropped.
- `onParticipantDisconnected` → `stopSession(roomName, 'participant')`.

**Fail path:** If `livekitRtcService.connectAgent` throws (bad credentials, URL, room full) → exception propagates up. Session is partially created. Cleanup relies on `stopSession` being called from the error path or the controller.

---

### Step 10-O · Configure frame sent

`handle.start()` → `sendConfigure()`. Executes once; idempotent (`configured` flag).

Frame structure (0x03-tagged binary):
```json
{
  "event": "configure",
  "voice_id": "<voiceId or 'stock_sarah_style2'>",
  "persona": "<systemPrompt>",
  "language": "<language or 'en'>",
  "tools": [{ "name": "...", "description": "...", "input_schema": {...}, "execution": "client" }],
  "greeting": "<greeting text>"   // omitted if empty
}
```

`greeting` field omitted when `config.greeting` is falsy — empty string would suppress turn-0 speech.

Logged: `appendLog: session_start` with redacted configure (voice_id, language, toolNames, hasGreeting — persona excluded from log).

**Fail path:** If socket not OPEN at send time (closed between open and first subscriber) → `sendControl` silently skips. Omni never receives configure; session stays unconfigured. No auto-retry for the configure frame itself.

---

### Step 11-O · Omni `hello` frame received

Omni sends `{"event":"hello", "call_id":"...", "audio_out": 24000, "voice_id":"..."}`.

Logged at INFO: full raw frame. `callbacks.onStatus('listening')` not called here — triggered by `configured` frame.

---

### Step 12-O · Omni `configured` frame received

Omni confirms configuration applied. Logged at INFO: full raw frame. `callbacks.onStatus('listening')` called.

**Fail path:** If configure was invalid (e.g. unknown voice_id) → Omni sends `{"detail":"voice_not_found"}` on the `0x01` audio tag. Detected by `0x7b` leading byte check, routed to `handleControl`. `handleControl` sees `msg.detail` with no `event`/`type` → logs ERROR `"Omni server error: voice_not_found"`. Session stays alive; no audio plays.

---

### Step 13-O · Mic audio loop

Every `onAudioChunk` call from LiveKit (16 kHz PCM16):
- If socket not OPEN: silently dropped.
- If `!configured`: silently dropped (no point streaming before configure).
- Else: prefixed with `MIC_AUDIO_TAG (0x01)`, sent as binary WebSocket frame.

First mic frame logged at INFO.

---

### Step 14-O · Omni processes internally (STT + VAD + LLM + TTS)

No code on our side. Omni does:
- STT: transcribes mic audio
- VAD: detects speech boundaries
- LLM: generates response
- TTS: synthesizes speech

---

### Step 15-O · Transcript tokens arrive (`0x02`)

Raw UTF-8 text chunks, one word or phrase per frame. Logged at INFO (`transcript token (0x02) Xb: "word"`). No further action — these are streaming partials, not the final transcript.

---

### Step 16-O · `transcript` control frame received

`handleControl` receives `{"event":"transcript", "role":"user"|"assistant", "text":"...", "final":true|false}`.

- Logged: `appendLog: stt_event` with role, transcript, final flag.
- If `role='user'` and `isFinal` → `callbacks.onStatus('processing')`.
- If `role='assistant'` and `isFinal` → `callbacks.onStatus('listening')`.
- If `isFinal` and role is user or assistant → `callbacks.onTranscript(event)`:
  - User final: appended to `convState.transcriptHistory` as `{role:'user', text, timestamp, turnIndex}`. `convState.lastUserUtterance = text`. State saved.
  - Assistant final: appended as `{role:'assistant', text, timestamp, turnIndex, toolCallNames}`. `pendingToolNames` cleared. `context.turnCount += 1`. State saved.
  - Save errors: logged ERROR, not propagated.

---

### Step 17-O · Agent audio arrives (`0x01`)

Audio PCM16 frames (no leading `{`):
- First 5 frames logged individually with byte count.
- Every 200 frames: cumulative stats logged (frames, bytes, seconds).
- Each frame: `callbacks.onStatus('speaking')` then `callbacks.onAudioOut(payload)`.
- `onAudioOut` → `livekitRtcService.enqueuePcm(roomName, payload, 24000)`:
  - Converts to `Int16Array`, appends to LiveKit `AudioSource` queue.
  - Resamples if `sampleRate !== 24000` (not needed here — Omni outputs 24000).
  - Logs stats every 1s. If `peak < 100` after frames received: WARN logged.
  - First frame: logs `"first captureFrame"`.

**Fail path:** `captureFrame` throws (e.g. AudioSource disposed) → WARN logged, frame dropped.

---

### Step 18-O · Barge-in (`barge_in` / `assistant_interrupted` / `flush`)

`handleControl` hits the `barge_in` | `flush` | `assistant_interrupted` case.

- If `msg.reply` present: logs truncated reply text.
- `callbacks.onBargeIn()`:
  - If `BARGE_IN_ENABLED=true`: `livekitRtcService.stopPlayback(roomName)` — clears AudioSource queue, aborts any pipeline publish loop.
  - If `BARGE_IN_ENABLED=false`: no-op.
- `callbacks.onStatus('listening')`.

---

### Step 19-O · Tool call (`tool_call` control frame)

`handleControl` routes to `runTool(msg, ...)`.

1. Extract `invocationId = msg.call_id`, `toolName = msg.name ?? msg.tool`, `args = msg.arguments ?? {}`.
2. If `invocationId` or `toolName` missing → silently return (invalid frame).
3. `toolRegistry.validateToolCall(toolName, args, config.enabledTools)`:
   - Not in registry → error string returned.
   - Not in `enabledTools` → error string returned.
   - Schema validation fails → error string returned.
4. **Fail path (validation):** `sendControl(socket, {type:'tool_result', call_id, error})`. `callbacks.onToolExecuted({..., success:false})`. Returns.
5. `toolExecution.execute(toolName, args, context)`:
   - Logs `tool_call` event.
   - Wraps in `withTimeout(toolTimeoutMs, toolName)` (default 12000ms via `ORCHESTRATION_TOOL_TIMEOUT_MS`).
   - **Fail path (timeout):** throws `'Tool "X" timed out after Nms'`. Caught, returns `{success:false, error}`. Logged `tool_result`.
   - **Fail path (execution error):** caught, returns `{success:false, error}`. Logged `tool_result`.
   - **Success:** returns `{success:true, output}`. Logged `tool_result`.
6. `sendControl(socket, {type:'tool_result', call_id, result|error})` — result returned to Omni regardless of success/fail.
7. `callbacks.onToolExecuted({toolName, args, output?, error?, success, timestamp})` → `pendingToolNames.push(toolName)`, `convState.toolCallHistory.push(...)`, state saved.

Omni receives the result and continues the conversation.

---

### Step 20-O · Session end (`session_end` / `session_ending` / `transfer_to_human`)

`handleControl` hits the end case:
- Logs `appendLog: session_stop` with engine and reason.
- `callbacks.onSessionEnd()` → `stopSession(roomName, 'agent')`.

---

## Part 3 — Default Pipeline Engine

### Step 5-P · STT stream opened

`sttService.transcribeStream(callId, roomName, participantId, language, sampleRate=16000, sttProvider)` returns a `SttStreamHandle`.

`sttStream.onEvent(event => handleSttEvent(roomName, event))` registered.

**Fail path:** If the STT provider's connect fails synchronously, exception propagates. Session partially created.

---

### Step 6-P · LiveKit RTC connected

Same as Step 9-O but callbacks differ:

- `onAudioChunk(pcm, participantId)`:
  - If barge-in disabled (`BARGE_IN_ENABLED=false`) and `isAgentSpeaking=true` → **dropped** (half-duplex).
  - Sets `session.participantId` on first non-agent chunk.
  - Calls `sttStream.writeAudio(pcm)` — pushes PCM into the STT stream.
- `onListenerReady` → `sendGreeting(roomName)`.
- `onParticipantDisconnected` → `stopSession(roomName, 'participant')`.

---

### Step 7-P · Greeting spoken

`sendGreeting(roomName)` → `speakToRoom(roomName, greetingText)`.

`speakToRoom`:
1. If session gone or text empty → returns `'skipped'`.
2. Generation check: `gen !== context.responseGenerationId` → returns `'skipped'`.
3. Barge-in backoff check: `Date.now() < bargeInUntilMs` → returns `'skipped'`.
4. `beginAgentSpeech(context, gen)` — sets `isAgentSpeaking=true`, `playbackGenerationId=gen`, logs `agent_speech_start`.
5. `costService.addTtsUsage(callId, text.length, provider)`.
6. `ttsService.synthesizeSpeech({text, voiceId, format:'pcm', sampleRate:24000}, ttsProvider)`.
   - **Fail path:** TTS throws → exception propagates to `speakToRoom.finally`, `endAgentSpeech` called, exception re-thrown. Greeting failure is not caught; status goes to `error`.
7. Stale check: `gen !== responseGenerationId` → returns `'interrupted'` without publishing.
8. `livekitRtcService.publishPcm(roomName, audio, sampleRate)`:
   - Supersedes any previous publish (aborts prior `playbackAbort`).
   - Publishes PCM in 20ms frames (480 samples at 24kHz).
   - Mid-publish abort check per frame: if `signal.aborted` → `result='interrupted'`.
   - On completion: `waitForPlayout()` then `result='completed'`.
9. `finally`: if `playbackGenerationId === gen` → `endAgentSpeech` (sets `isAgentSpeaking=false`, status back to `'listening'`).

Logs `appendLog: agent_playback` with `{greeting: true}`.

---

### Step 8-P · Mic audio enters STT

Each `onAudioChunk` pushes `pcm` to `sttStream.writeAudio`. The STT provider (Deepgram, PyAI Hear) runs VAD and streaming transcription internally.

---

### Step 9-P · STT events arrive → `handleSttEvent`

Every STT event is logged: `appendLog: stt_event`.

**Half-duplex gate:** if `!isBargeInEnabled() && isAgentSpeaking` → entire function returns early (STT events ignored while agent is speaking).

**Barge-in signal path** (only when `BARGE_IN_ENABLED=true` and `isAgentSpeaking`):
- `speech_start` → `scheduleBargeInConfirm(roomName)`: sets a `setTimeout` for `BARGE_IN_MIN_VOICE_MS` (default 300ms). If it fires before cancellation → `confirmBargeIn`.
- `interim` with content word (not in BACKCHANNEL_WORDS set) → `confirmBargeIn` immediately.
- `speech_end` before confirm fires → `clearBargeInConfirm` (noise, not a real interruption).

`confirmBargeIn`:
1. Start holdoff check: if elapsed since `agentSpeechStartedAtMs < BARGE_IN_START_HOLDOFF_MS` (400ms) → reschedule, wait remainder.
2. Increments `responseGenerationId`.
3. Sets `bargeInUntilMs = now + BARGE_IN_BACKOFF_MS` (700ms).
4. `livekitRtcService.stopPlayback(roomName)`.
5. `endAgentSpeech`.
6. Logs `appendLog: agent_interrupted`.

**Milestones recorded by STT events:**
- `speech_start` → `performanceService.recordMilestone('user_speech_start')`
- `speech_end` → `performanceService.recordMilestone('user_speech_end')`
- `final` → `session.finalTranscript = transcript`, `recordMilestone('stt_final_transcript')`

**Turn detection** (`TurnDetectionService.detectFromSttEvent`):
- `speech_start` → clears silence timer, returns `user_speech_start` decision (logged as `stt_turn_signal`).
- `interim` → updates `pendingTranscripts` map.
- `final` → updates `pendingTranscripts`, schedules silence timer (`turnSilenceMs` default 1200ms). When timer fires and `pendingTranscript` is non-empty → calls `onUserTurnComplete` callback.
- `speech_end` → returns `user_speech_end` decision (logged as `stt_turn_signal`).

**Fail path for `onUserTurnComplete` guard:** if `isAgentSpeaking=true` when timer fires → callback returns immediately without processing the turn.

---

### Step 10-P · `onUserTurnComplete` — turn committed

1. If `isProcessingTurn=true`: bumps `responseGenerationId` to supersede in-flight response, continues.
2. Trims utterance. If empty → returns (no turn).
3. Sets `isProcessingTurn=true`, `setStatus('processing')`.
4. Logs `appendLog: user_turn_end`.
5. Calls `processUserUtterance(roomName, utterance)`.

**Fail path:** if `processUserUtterance` throws → status → `'error'`, `session.error` set, `appendLog: error` written. `isProcessingTurn` cleared in `finally`.

---

### Step 11-P · LLM orchestration (`OrchestratorService.handleUserTurn`)

1. `conversationState.getOrCreate(...)` — creates or retrieves `ConversationState`. Sets `lastUserUtterance`, `currentStep='thinking'`, saves.
2. Logs `orchestration_start`.
3. `promptBuilder.build(state, userUtterance)` → `{ messages: LlmMessage[], tools: LlmTool[] }`.
4. Logs `prompt_built`.
5. Appends user turn to `state.llmMessages` and `state.transcriptHistory`.

**LLM loop** (up to `maxToolLoops`, default 3):
- `llmService.generateResponse({messages, tools}, llmProvider)`.
   - **Fail path (LLM error):** throws → caught by outer `try/catch` in `handleUserTurn` → `state.retryCount += 1`, `currentStep='listening'`, saves state, logs `orchestration_error`, returns fallback response text. No retry of LLM.
- If no tool calls → `break`.
- If tool calls present:
  - `resolveExecutionFiller(toolNames, toolConfigs)` → optional filler text.
  - `hooks.onBeforeToolExecution` called → `speakToolFiller` starts fire-and-forget filler TTS.
  - Tool calls executed serially in `executeToolCalls`.

**Per-tool execution:**
1. `toolRegistry.validateToolCall(name, args, enabledTools)`:
   - Tool unknown, not enabled, or schema invalid → returns error string.
   - **Fail path:** Appends `{success:false}` result. Appends to `state.toolCallHistory`. Continues to next tool.
2. `toolExecution.execute(toolName, args, context)`:
   - Logs `tool_call`.
   - `withTimeout(tool.execute(args, context), toolTimeoutMs)`.
   - **Timeout:** `'Tool "X" timed out after Nms'` → `{success:false, error}`.
   - **Execution error:** caught → `{success:false, error}`.
   - **Success:** `{success:true, output}`.
   - Logs `tool_result` in all cases.
3. Result appended to `state.toolCallHistory`. State saved.
4. Tool message (`role:'tool'`) appended to `workingMessages` for next LLM call.

After `maxToolLoops` without final text: WARN logged, proceeds to planner with empty `lastText`.

**Response planning (`ResponsePlannerService.plan`):**
- If LLM text is absent or raw JSON, and tool results are present → attempts formatter for each successful tool.
- Formatters exist for: `get_user_details`, `get_current_datetime`, `get_weather`, `web_search`, `end_call`.
- If no formatter → uses LLM text.
- If still empty → `fallbackResponse` from config.

**Guardrail check (`GuardrailService.check`):**
- Empty text → replaced with fixed fallback phrase.
- Looks like JSON → replaced with fixed fallback phrase.
- Over 500 chars → truncated at last sentence boundary.

Result: `{speakableText, finishReason, toolCallsExecuted, shouldEndCall, llmUsage}`.

---

### Step 12-P · Generation staleness check

After orchestration returns, `generationId !== context.responseGenerationId` means a barge-in occurred during orchestration.

**Stale path:** Conversation history updated with `[interrupted]` prefix. Logs `llm_response` with `interrupted:true`. Token usage still recorded. Returns without speaking.

---

### Step 13-P · Filler awaited

If filler was started: `await fillerPlayback`. If during filler await a barge-in bumps the generation → staleness check fires again → return.

---

### Step 14-P · TTS synthesis

`ttsService.synthesizeSpeech({text, voiceId, format:'pcm', sampleRate:24000}, ttsProvider)`.

Logs `tts_start`, `performanceService.recordMilestone('tts_start')`.

**Fail path:** TTS throws → exception propagates to `processUserUtterance` catch → `session.status='error'`, error logged. No retry.

---

### Step 15-P · Audio published

`livekitRtcService.publishPcm(roomName, audio, sampleRate)` — same mechanics as Step 7-P.

Logs `tts_complete` with duration and result.

**Interrupted:** `speakResult === 'interrupted'` → last conversation entry prefixed `[interrupted]`. Return.
**Skipped:** same handling.
**Completed:**
- `performanceService.commitTurnLatency(callId)` → computes `stt/llm/tts/total` latency from milestones.
- `context.turnCount += 1`.
- Logs `latency_snapshot`, `agent_playback`.
- `callLogsService.updateLatencyMetrics(callId, turnLatency)`.
- If `orchestration.shouldEndCall` and generation still current → `stopSession(roomName, 'agent')`.

---

## Part 4 — Session Cleanup (shared, both engines)

### `stopSession(roomName, endedBy)`

Called by: user disconnect, agent-initiated end, fatal error, participant left.

1. `clearBargeInConfirm` — cancels pending barge-in setTimeout.
2. `livekitRtcService.stopPlayback(roomName)` — clears audio queue, aborts publish.
3. Pipeline: `sttStream.end()` — closes STT provider stream.
4. Omni: `context.omni.stop()` → `ws.close(1000, 'session stop')`. Errors swallowed.
5. `livekitRtcService.disconnect(roomName)` — closes agent track, disconnects from LiveKit room.
6. `turnDetectionService.clearCall(callId)` — clears silence timer and pending transcript.
7. `conversationStateService.release(callId)` — releases in-memory state (Mongo variant may do nothing).
8. `performanceService.getFinalMetrics / clearRecord` — computes p50/p95 response latency.
9. `costService.finalize(callId, callSeconds)` — prices streaming STT by wall-clock duration. Clears record.
10. `sessions.delete(roomName)` — removes from active sessions Map.
11. `session.status = 'stopped'`.
12. Logs `appendLog: session_stop` (endedBy, turnCount, duration, latency metrics).
13. `callLogsService.finalizeCall(callId, endedBy, hasErrors, {turnCount, finalLatencyMetrics, finalCost})`.
14. `postCallAnalysis.analyze(callId)` — fire-and-forget:
    - Reads `transcriptHistory` from conversation state.
    - If empty → skips.
    - Builds prompt, calls LLM (`generateResponse` with default provider).
    - Parses JSON response for `{summary, sentiment}`.
    - Writes to call record.
    - All errors caught and logged; never affects session cleanup.

---

## Failure Summary Table

| Scenario | Where detected | Effect |
|----------|---------------|--------|
| PYAI_API_KEY missing | `omniEngine.connect` | Throws → pipeline fallback |
| Omni connect timeout (8s) | `openSocket` | Rejects → pipeline fallback |
| Omni fatal close code (4401/4403) | `socket.on('close')` | `onFatalError` → `stopSession('error')` |
| Omni transient disconnect | `socket.on('close')` | Reconnect up to 2 attempts with backoff |
| Omni reconnect fails | `openSocket` rejects | `onFatalError` → `stopSession('error')` |
| Omni invalid voice_id | `0x01` frame with `{` prefix | `handleControl` → ERROR log, no audio. Session stays alive. |
| Omni unparseable control frame | `JSON.parse` throws | WARN log, frame skipped |
| Omni unknown control event | `default` in switch | INFO log, session continues |
| Tool not in registry | `toolRegistry.validateToolCall` | `{success:false}` returned to LLM/Omni |
| Tool not in enabledTools | `toolRegistry.validateToolCall` | `{success:false}` returned to LLM/Omni |
| Tool timeout | `withTimeout` | `{success:false, error:'timed out'}` returned to LLM/Omni |
| Tool execution error | `tool.execute` throws | `{success:false, error}` returned to LLM/Omni |
| LLM error | `llmService.generateResponse` throws | Fallback text spoken, `orchestration_error` logged |
| LLM max tool loops hit | after `maxLoops` | WARN, proceeds with last LLM text or fallback |
| Guardrail: empty/JSON response | `guardrailService.check` | Fixed fallback phrase substituted |
| Guardrail: response too long | `guardrailService.check` | Truncated at sentence boundary (500 char limit) |
| TTS synthesis error | `ttsService.synthesizeSpeech` throws | Exception propagates → `session.status='error'` |
| ElevenLabs key missing | `resolveTtsProvider` | Falls back to OpenAI TTS |
| Audio publish interrupted | `publishPcm` mid-stream | `result='interrupted'`, conversation entry marked `[interrupted]` |
| Barge-in during TTS | `publishPcm` abort signal | Publish aborted, `endAgentSpeech` called |
| Barge-in during LLM wait | `responseGenerationId` mismatch | Orchestration result discarded silently |
| Participant disconnect | LiveKit `ParticipantDisconnected` | `stopSession('participant')` |
| Session not found | `sessions.get` miss | Silently returns / throws NotFoundException on public methods |
| Duplicate session | `sessions.has` check | `ConflictException` (409) |
| Post-call analysis LLM error | `postCallAnalysis.analyze` catch | Logged WARN, call record has no summary — no other effect |
