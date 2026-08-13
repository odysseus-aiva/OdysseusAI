# Default Tools and Agent Assignment

This document describes the built-in tool catalogue, MongoDB assignment model, runtime resolution, provider choices, UI flow, and how to extend the system.

## Research findings (Retell, Vapi, Bland, others)

| Pattern | Platforms | Our approach |
| --- | --- | --- |
| Built-in tools shipped in product code; custom tools separate | Retell, Vapi | Code catalogue + Nest `AgentTool` implementations |
| Explicit per-agent tool assignment (not global) | Retell Functions, Vapi tools array | Mongo `agent_tools` with `enabled`; deny-by-default |
| Per-tool configuration | Retell / Vapi / Bland | `config` JSON per `(agentId, toolName)` |
| Test tools without a live call | Retell webhook tester | `POST /agents/:agentId/tools/:toolName/test` |
| Call-control defaults (end / transfer / DTMF / SMS) | Vapi, Retell | Phase 1: `end_call` only |
| Weather / search as first-party | Rarely first-party (usually custom HTTP) | First-party `get_weather` + `web_search` |
| Pathway / graph control of when tools run | Bland | Skipped — keep LLM tool-choice loop |

**High-value defaults documented for a later phase (not implemented now):** `transfer_call`, `send_sms`, `dtmf`, calendar check/book, knowledge base, `extract_dynamic_variable`.

## Chosen architecture

1. **Catalogue in code** — [`src/orchestration/tools/catalogue/built-in-tools.catalogue.ts`](src/orchestration/tools/catalogue/built-in-tools.catalogue.ts) defines metadata, default config, and JSON Schema for the UI.
2. **Implementations in Nest** — classes implementing `AgentTool`, registered in `OrchestrationModule.onModuleInit`.
3. **Assignments in MongoDB (or in-memory)** — `agents` + `agent_tools` collections; unique index on `{ agentId, toolName }`.
4. **Session resolve** — `AgentToolResolverService` loads enabled tools + configs when `agentConfig.agentId` is set.
5. **Allowlist enforcement** — empty `enabledTools` means **no tools**; only `undefined` (legacy ad-hoc sessions without an agent) lists all registered tools.

```text
UI assign/configure → agent_tools (Mongo)
       ↓
Session start with agentId → AgentToolResolver
       ↓
ConversationState.enabledTools + toolConfigs
       ↓
LLM sees only assigned tools → ToolExecutionService → speakable reply
```

## Why unnecessary libraries were avoided

- **Weather:** Open-Meteo over HTTP `fetch` — no SDK, no API key for POC non-commercial use.
- **Web search:** Native `fetch` to Tavily / Brave REST APIs — no `@tavily/core` / Brave SDK coupling; provider swap is env-only.
- **Datetime / end call:** Pure Node / in-process — no external deps.

## MongoDB model

### `agents`

| Field | Notes |
| --- | --- |
| `agentId` | Unique slug |
| `name`, `systemPrompt`, `defaultProviders`, `voiceId`, `language` | Session defaults |
| `createdAt`, `updatedAt` | Epoch ms |

### `agent_tools`

| Field | Notes |
| --- | --- |
| `agentId` + `toolName` | **Unique compound index** |
| `enabled` | Must be true to appear in a session |
| `config` | Per-agent overrides merged with catalogue defaults |

Same tool name can have different configs for different agents.

With `PERSISTENCE_PROVIDER=memory`, an in-memory twin store is used so local demos work without Mongo.

## Runtime tool resolution

1. Client starts session with `{ agentConfig: { agentId } }`.
2. `VoiceAgentService` calls `AgentToolResolverService.resolve()`.
3. Resolver loads agent + enabled `agent_tools`, intersects with assignable catalogue entries.
4. Request-level `enabledTools` may **further restrict**, never expand beyond assigned+enabled.
5. Snapshot is stored on conversation state (`enabledTools`, `toolConfigs`) for session isolation.

## Session isolation

- Each call has its own `callId` / conversation document.
- Tool configs are copied onto that conversation at first turn — concurrent sessions for different agents never share allowlists.
- `ToolRegistryService.validateToolCall` rejects any tool not on the session allowlist.

## Weather API choice — Open-Meteo

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Forecast: `https://api.open-meteo.com/v1/forecast`
- Supports current conditions + daily forecast (today / tomorrow / weekend filtering in-tool).
- Free for non-commercial POC use; commercial deployments should use Open-Meteo customer API + key.

## Web-search provider choice and abstraction

**Default: Tavily** — agent-oriented JSON (`answer` + results), domain include/exclude, search depth, monthly free tier suitable for POC.

**Alternate: Brave** — switch with `WEB_SEARCH_PROVIDER=brave` and `BRAVE_SEARCH_API_KEY`. Faster/cheaper; free tier is rate-limited (1 qps).

Interface: `WebSearchProvider` in `src/orchestration/tools/web-search/`. Normalized LLM-facing output:

```ts
{ answer?: string; results: { title, url, snippet, publishedAt? }[] }
```

Voice optimizations: small `maxResults` (default 3), URL/title dedupe, snippet budget (`maxContentLength`), description instructs not to read URLs aloud; full URLs remain in call-log `tool_result` events.

## Agent-tool assignment

1. `GET /tools/catalogue` — assignable built-ins + config schemas.
2. `PUT /agents/:agentId/tools` — batch upsert `{ toolName, enabled, config }`.
3. Only catalogue tools with `assignable: true` can be assigned (`get_user_details` remains a demo tool, not in the UI catalogue).

## UI flow

1. Open `/agents` → create an agent.
2. Open `/agents/[agentId]` → enable Weather / Web Search / DateTime / End Call, configure, **Test**, **Save**.
3. On `/` pick the agent (or use `?agentId=`) → Talk.
4. Ask weather or current-info questions; LLM selects assigned tools only.

BFF proxies live under `web/src/app/api/agents/**` and `web/src/app/api/tools/catalogue`.

## Tool testing

`POST /agents/:agentId/tools/:toolName/test` with `{ args }` runs the real tool with that agent’s stored config (tool must be enabled). No LiveKit room required.

## Speak during tool execution (fillers)

Retell-style **static** execution speech. Per-tool config on `agent_tools.config` (also in catalogue defaults):

| Field | Type | Meaning |
| --- | --- | --- |
| `speakDuringExecution` | boolean | If true, speak while the tool runs |
| `executionMessage` | string | Exact line spoken (keep short) |

Defaults: **on** for `get_weather` / `web_search`; **off** for `get_current_datetime` / `end_call`.

Flow: LLM returns tool_calls → resolve filler from the first matching tool → start TTS filler **in parallel** with tool HTTP → await filler if still playing → speak final answer.

Configure in **Agents → tool card → speakDuringExecution / executionMessage**, then Save. Existing agents keep old configs until re-saved (resolver merges catalogue defaults at runtime for missing keys via `resolveExecutionFiller`).

Not in this phase: LLM-generated filler (`prompt` mode), barge-in cancel of filler.

## How to add another built-in tool

1. Add metadata to `BUILT_IN_TOOLS_CATALOGUE`.
2. Implement `@Injectable()` class implementing `AgentTool`.
3. Register provider + `toolRegistry.register(...)` in `OrchestrationModule`.
4. Optionally add a speech formatter entry in `ResponsePlannerService`.
5. Add env keys to `configuration.ts` + `.env.example` if needed.
6. Document in this file.

## Known limitations

- No auth on agents/tools APIs (POC).
- Claude LLM provider still lacks tool calling.
- Open-Meteo free tier is non-commercial.
- Web search requires a provider API key.
- Ad-hoc sessions without `agentId` still get all registered tools when `enabledTools` is omitted (legacy POC behavior).
- Custom HTTP / marketplace tools not in scope.
- Tool fillers are static text only (no LLM-generated execution speech yet).

## Recommended next phase

1. `transfer_call`, `send_sms`, `dtmf`.
2. Auth + multi-tenant agent ownership.
3. Custom webhook tools (Retell-style).
4. Knowledge-base retrieval tool.
5. Per-tool timeout overrides; LLM-prompt execution fillers.
6. Tighten legacy sessions: require explicit allowlist always.
7. Barge-in / cancel filler on user interrupt.
