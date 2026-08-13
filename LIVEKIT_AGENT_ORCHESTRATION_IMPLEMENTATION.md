# LiveKit Agent Orchestration — Implementation

This document describes the orchestration layer added to the LiveKit voice agent POC.  
See also: [LIVEKIT_AGENT_ORCHESTRATION_PLAN.md](./LIVEKIT_AGENT_ORCHESTRATION_PLAN.md), [LIVEKIT_VOICE_AGENT_FLOW.md](./LIVEKIT_VOICE_AGENT_FLOW.md).

---

## What was implemented

A Retell-style **generic orchestration framework** under `src/orchestration/`:

| Component | Role |
|-----------|------|
| `OrchestratorService` | Turn pipeline: state → prompt → LLM → tools → speakable text |
| `PromptBuilderService` | Builds system + history + tool instructions |
| `ConversationStateService` | In-memory conversation / tool history per `callId` |
| `ToolRegistryService` | Register / list / validate tools |
| `ToolExecutionService` | Execute with timeout + normalized result |
| `ResponsePlannerService` | Ensure only natural language reaches TTS |
| `GuardrailService` | Block empty / raw JSON / overly long speech |
| `EventLoggerService` | Orchestration steps → `CallLogsService` |
| `GetUserDetailsTool` | Example tool: `GET https://dummyjson.com/users/1` |

`VoiceAgentService.processUserUtterance()` now delegates decision-making to `OrchestratorService`, then keeps the existing TTS → LiveKit playback path.

OpenAI LLM provider supports **function/tool calling**. LLM types include `tools`, `toolCalls`, and `finishReason`.

---

## How the flow works

```
User final transcript
  → VoiceAgentService.onUserTurnComplete()
  → OrchestratorService.handleUserTurn()
       → ConversationStateService.getOrCreate()
       → PromptBuilderService.build()
       → LlmService.generateResponse(messages, tools)
       → [optional tool loop, max 3]
            → ToolRegistry.validateToolCall()
            → ToolExecutionService.execute()
            → feed tool result back to LLM
       → ResponsePlannerService.plan()
       → GuardrailService.check()
  → TtsService.synthesizeSpeech(speakableText)
  → LivekitRtcService.publishPcm()
```

Tool-specific logic does **not** live in `VoiceAgentService` or the core loop of `OrchestratorService`. Tools are classes implementing `AgentTool` and registered once in `OrchestrationModule.onModuleInit()`.

---

## Example: `get_user_details`

**File:** `src/orchestration/tools/get-user-details.tool.ts`

- **name:** `get_user_details`
- **when:** User asks for user details / profile / account info
- **HTTP:** `GET https://dummyjson.com/users/1`
- **returns:** `{ id, firstName, lastName, age, email, phone, username }`

**Spoken fallback** (if LLM text is empty/JSON) via `ResponsePlannerService`:

> "I found your user details. Your name is Emily Johnson. Your username is emilys. Your email is emily.johnson@x.dummyjson.com."

---

## How to add a new tool

1. Create `src/orchestration/tools/my-tool.tool.ts` implementing `AgentTool`.
2. Add the class to `OrchestrationModule` providers.
3. Register it in `onModuleInit()`:

```typescript
this.toolRegistry.register(this.myTool);
```

4. Optionally restrict per session with `agentConfig.enabledTools: ['my_tool']`.

No changes to `OrchestratorService` or `VoiceAgentService` are required for normal tools.  
If you want a deterministic spoken summary when the LLM returns empty text, add a small branch in `ResponsePlannerService.buildFromToolResults()`.

---

## Example request / response flow

### Start session

```bash
curl -X POST http://localhost:3000/voice-agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "demo-room",
    "callId": "call-orch-1",
    "agentConfig": {
      "systemPrompt": "You are a helpful voice assistant.",
      "llmProvider": "openai",
      "ttsProvider": "openai",
      "agentId": "support-agent",
      "dynamicVariables": { "company": "Acme" },
      "enabledTools": ["get_user_details"]
    }
  }'
```

Optional fields (`agentId`, `dynamicVariables`, `enabledTools`) are backward-compatible.

### User says: "I want my user details"

1. STT final transcript → turn complete  
2. Orchestrator logs `orchestration_start`  
3. LLM (or temporary intent fallback without API key) requests `get_user_details`  
4. Tool fetches DummyJSON user `1`  
5. Logs: `tool_call`, `tool_result`  
6. Second LLM pass (or planner fallback) produces speakable text  
7. TTS + LiveKit playback  

Inspect logs:

```bash
curl http://localhost:3000/call-logs/call-orch-1
```

Look for steps: `orchestration_start`, `prompt_built`, `llm_response`, `tool_call`, `tool_result`, `response_planned`, `guardrail_check`, `orchestration_complete`.

---

## Config

| Env | Default | Meaning |
|-----|---------|---------|
| `ORCHESTRATION_MAX_TOOL_LOOPS` | `3` | Max LLM↔tool iterations per turn |
| `ORCHESTRATION_TOOL_TIMEOUT_MS` | `5000` | Per-tool timeout |
| `ORCHESTRATION_FALLBACK_RESPONSE` | polite apology | Used on orchestration failure |

---

## Known limitations

- Conversation state is **in-memory** (lost on restart); swap `ConversationStateService` for Redis/Postgres later.
- Only one example tool is registered (`get_user_details`).
- Temporary **intent fallback** for user-details when `OPENAI_API_KEY` is missing (provider returns simulated text without tool_calls). Remove once all LLM providers support tools.
- Claude provider does not yet implement structured tool calling.
- No SIP transfer / SMS / ticket tools yet.
- Guardrails are basic (JSON / empty / max length) — not a full safety policy engine.
- DummyJSON is a demo API, not a real customer CRM.

---

## Next steps

1. Add more tools (`transfer_call`, `end_call`, etc.) as separate classes.  
2. Persist conversation state.  
3. Implement tool calling for Claude (or remove simulated path).  
4. Remove the temporary intent fallback.  
5. Post-call analysis from `toolCallHistory` + transcripts.  
6. Stronger schema validation for tool arguments (JSON Schema library).

---

## Project layout

```
src/orchestration/
├── orchestration.module.ts
├── orchestrator.service.ts
├── prompt-builder.service.ts
├── conversation-state.service.ts
├── tool-registry.service.ts
├── tool-execution.service.ts
├── response-planner.service.ts
├── guardrail.service.ts
├── event-logger.service.ts
├── interfaces/
│   ├── agent-tool.interface.ts
│   ├── tool-execution-context.interface.ts
│   └── orchestration.types.ts
└── tools/
    └── get-user-details.tool.ts
```
