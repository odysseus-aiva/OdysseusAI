#!/usr/bin/env node
/**
 * Loads sample-data/ into MongoDB so a fresh clone has a populated dashboard,
 * call history, transcripts, latency analytics and cost figures without placing
 * a single real call.
 *
 * Everything written here is namespaced by the callIds in sample-data/calls.json
 * and re-running replaces only those documents — real calls are never touched.
 *
 *   node scripts/seed-sample-data.mjs           # insert / refresh sample data
 *   node scripts/seed-sample-data.mjs --clean   # remove sample data, then exit
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLEAN_ONLY = process.argv.includes('--clean');

/** Mirrors src/cost/cost-rates.ts so sample costs match what the app computes. */
const LLM_MODEL = 'gpt-4.1-nano';
const LLM_RATE = { inputPerMillion: 0.1, outputPerMillion: 0.4 };
const TTS_RATE_PER_MILLION_CHARS = { openai: 15, elevenlabs: 100, cartesia: 40 };
const STT_RATE_PER_MINUTE = 0.0043;
const OMNI_RATE_PER_SECOND = 0.05 / 60;

try {
  await main();
} catch (err) {
  console.error(`\nSeeding failed: ${err.message}`);
  process.exit(1);
}

async function main() {
  const { uri, dbName, provider } = readPersistenceConfig();

  if (provider !== 'mongodb') {
    console.error(
      'PERSISTENCE_PROVIDER is not "mongodb".\n' +
        'Sample data lives in MongoDB, so set these in .env and retry:\n' +
        '  PERSISTENCE_PROVIDER=mongodb\n' +
        '  MONGODB_URI=mongodb://localhost:27017',
    );
    process.exit(1);
  }
  if (!uri) {
    console.error('MONGODB_URI is not set — add it to .env and retry.');
    process.exit(1);
  }

  const agents = readJson('sample-data/agents.json');
  const calls = readJson('sample-data/calls.json');

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName || undefined);
    const callIds = calls.map((c) => c.callId);

    // Idempotent by construction: drop only the documents this script owns.
    const removed = await Promise.all([
      db.collection('calls').deleteMany({ callId: { $in: callIds } }),
      db.collection('call_events').deleteMany({ callId: { $in: callIds } }),
      db.collection('conversations').deleteMany({ callId: { $in: callIds } }),
    ]);
    const removedCount = removed.reduce((sum, r) => sum + r.deletedCount, 0);

    if (CLEAN_ONLY) {
      console.log(`Removed ${removedCount} sample documents. Agents left in place.`);
      return;
    }

    const agentsById = new Map(agents.map((a) => [a.agentId, a]));
    const agentResult = await seedAgents(db, agents);

    const callDocs = [];
    const eventDocs = [];
    const conversationDocs = [];

    for (const call of calls) {
      const built = buildCall(call, agentsById.get(call.agentId));
      callDocs.push(built.call);
      eventDocs.push(...built.events);
      conversationDocs.push(built.conversation);
    }

    await db.collection('calls').insertMany(callDocs);
    await db.collection('call_events').insertMany(eventDocs);
    await db.collection('conversations').insertMany(conversationDocs);

    const turns = callDocs.reduce((sum, c) => sum + c.turnCount, 0);
    console.log(
      [
        `Seeded ${agentResult.inserted} agents` +
          (agentResult.kept ? ` (${agentResult.kept} already existed, left as-is)` : ''),
        `${callDocs.length} calls (${turns} turns)`,
        `${eventDocs.length} pipeline events`,
        `${conversationDocs.length} transcripts`,
      ].join(', ') + `\ndatabase: ${dbName || '(from connection string)'}`,
    );
    console.log('Open http://localhost:3001/dashboard to see it.');
  } finally {
    await client.close();
  }
}

/**
 * Agents are inserted only when missing. An agent you have edited — prompt,
 * voice, engine, attached phone number — is never overwritten by a re-run, which
 * is why this is not a blind upsert.
 */
async function seedAgents(db, agents) {
  const now = Date.now();
  let inserted = 0;
  let kept = 0;

  for (const agent of agents) {
    const { tools = [], ...fields } = agent;

    const existing = await db
      .collection('agents')
      .findOne({ agentId: agent.agentId }, { projection: { _id: 1 } });

    if (existing) {
      kept += 1;
    } else {
      await db
        .collection('agents')
        .insertOne({ ...fields, createdAt: now, updatedAt: now });
      inserted += 1;
    }

    for (const toolName of tools) {
      await db.collection('agent_tools').updateOne(
        { agentId: agent.agentId, toolName },
        {
          $setOnInsert: {
            enabled: true,
            config: {},
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }
  }

  return { inserted, kept };
}

/**
 * Expands one scenario into the three documents the API reads: the `calls`
 * summary row, the `call_events` pipeline timeline, and the `conversations`
 * transcript. Timestamps are chained turn by turn so latency analytics and the
 * event timeline line up with the numbers in the fixture.
 */
function buildCall(scenario, agent) {
  const engine = agent?.engine ?? 'pipeline';
  const startedAt = timestampFor(scenario);
  const events = [];
  const transcript = [];
  const toolCallHistory = [];
  const llmMessages = [];
  const turnLatencies = [];

  let cursor = startedAt;
  let promptTokens = 0;
  let completionTokens = 0;
  let ttsCharacters = 0;
  let turnCount = 0;
  let lastStages = {};

  const push = (step, timestamp, extra = {}) =>
    events.push({
      eventId: `${scenario.callId}-${String(events.length + 1).padStart(3, '0')}`,
      callId: scenario.callId,
      roomName: roomFor(scenario),
      participantId: 'user',
      step,
      timestamp,
      ...extra,
    });

  push('session_start', cursor, { data: { engine, agentId: scenario.agentId } });
  push('agent_config_loaded', cursor + 40, {
    data: { agentId: scenario.agentId, engine, enabledTools: agent?.tools ?? [] },
  });
  push('participant_joined', cursor + 120, { data: { participantId: 'user' } });
  cursor += 900;

  scenario.turns.forEach((turn, index) => {
    const turnIndex = index + 1;
    const stt = turn.latencyMs?.stt;
    const llm = turn.latencyMs?.llm;
    const tts = turn.latencyMs?.tts;
    const total = turn.latencyMs?.total;

    const userSpeechStart = cursor;
    const userSpeechEnd = userSpeechStart + speechMs(turn.user);
    const sttFinal = userSpeechEnd + (stt ?? 0);

    push('audio_received', userSpeechStart, { data: { bytes: 3200 } });
    push('stt_event', sttFinal, {
      data: { event: { type: 'transcript', isFinal: true, text: turn.user } },
      latencyMs: stt,
    });
    push('user_turn_end', sttFinal + 5, {
      data: { transcript: turn.user, turnIndex },
    });

    transcript.push({ role: 'user', text: turn.user, timestamp: sttFinal, turnIndex });
    llmMessages.push({ role: 'user', content: turn.user });

    const llmStart = sttFinal + 20;
    const llmEnd = llmStart + (llm ?? 0);

    push('orchestration_start', llmStart - 5, { data: { turnIndex } });
    push('llm_request', llmStart, {
      data: { request: { userUtterance: turn.user, model: LLM_MODEL } },
    });

    const toolNames = [];
    (turn.tools ?? []).forEach((tool, toolIndex) => {
      const success = tool.success !== false && !tool.error;
      const callAt = llmStart + 60 + toolIndex * 40;
      const resultAt = callAt + (tool.latencyMs ?? 0);

      push('tool_call', callAt, { data: { toolName: tool.name, input: tool.input } });
      push('tool_result', resultAt, {
        data: { toolName: tool.name, success, output: tool.output },
        latencyMs: tool.latencyMs,
        ...(tool.error ? { error: tool.error } : {}),
      });

      toolNames.push(tool.name);
      toolCallHistory.push({
        name: tool.name,
        input: tool.input,
        ...(tool.output !== undefined ? { output: tool.output } : {}),
        ...(tool.error ? { error: tool.error } : {}),
        success,
        timestamp: resultAt,
      });
    });

    const turnPromptTokens = 220 + index * 55 + tokensFor(turn.user);
    promptTokens += turnPromptTokens;

    if (turn.error) {
      push('error', llmEnd, { error: turn.error, data: { turnIndex } });
      cursor = llmEnd + 400;
      return;
    }

    completionTokens += tokensFor(turn.agent) + 8;
    ttsCharacters += turn.agent.length;

    push('llm_response', llmEnd, {
      data: {
        response: { text: turn.agent, model: LLM_MODEL, finishReason: 'stop' },
        durationMs: llm,
      },
      latencyMs: llm,
    });

    const ttsStart = llmEnd + 15;
    const ttsEnd = ttsStart + (tts ?? 0);
    push('tts_start', ttsStart, { data: { textLength: turn.agent.length } });
    push('tts_complete', ttsEnd, {
      data: { textLength: turn.agent.length, durationMs: tts, format: 'pcm_24000' },
      latencyMs: tts,
    });

    const playbackStart = userSpeechEnd + (total ?? 0);
    const playbackEnd = playbackStart + speechMs(turn.agent);
    push('agent_speech_start', playbackStart, { data: { turnIndex } });
    push('agent_speech_end', playbackEnd, { data: { turnIndex } });

    push('latency_snapshot', playbackEnd + 5, {
      data: {
        turnIndex,
        sttLatencyMs: stt,
        llmLatencyMs: llm,
        ttsLatencyMs: tts,
        totalResponseLatencyMs: total,
      },
      latencyMs: total,
    });

    transcript.push({
      role: 'assistant',
      text: turn.agent,
      timestamp: playbackStart,
      turnIndex,
      ...(toolNames.length ? { toolCallNames: toolNames } : {}),
    });
    llmMessages.push({ role: 'assistant', content: turn.agent });

    if (typeof total === 'number') turnLatencies.push(total);
    lastStages = {
      sttLatencyMs: stt,
      llmLatencyMs: llm,
      ttsLatencyMs: tts,
      totalResponseLatencyMs: total,
      userSpeechStart,
      userSpeechEnd,
      sttFinalTranscript: sttFinal,
      llmStart,
      llmEnd,
      ttsStart,
      ttsEnd,
      agentPlaybackStart: playbackStart,
    };
    turnCount += 1;
    cursor = playbackEnd + 700;
  });

  // The fixture owns the headline duration; extend it only if the generated
  // timeline would otherwise overrun it.
  const endedAt = Math.max(startedAt + scenario.durationSec * 1000, cursor + 500);
  const durationMs = endedAt - startedAt;

  push('participant_left', endedAt - 200, { data: { participantId: 'user' } });
  push('session_stop', endedAt, {
    data: { endedBy: scenario.endedBy, turnCount },
  });

  const sorted = [...turnLatencies].sort((a, b) => a - b);
  const latencyMetrics = {
    ...lastStages,
    ...(sorted.length
      ? {
          p50ResponseLatencyMs: percentile(sorted, 50),
          p95ResponseLatencyMs: percentile(sorted, 95),
          turnsWithLatency: sorted.length,
        }
      : {}),
  };

  const call = {
    callId: scenario.callId,
    roomName: roomFor(scenario),
    participantId: 'user',
    agentId: scenario.agentId,
    agentSnapshot: {
      name: agent?.name,
      llmProvider: agent?.defaultProviders?.llm,
      llmModel: engine === 'omni' ? 'pyai-omni' : LLM_MODEL,
      ttsProvider: agent?.defaultProviders?.tts,
      sttProvider: agent?.defaultProviders?.stt,
      language: agent?.language,
      greeting: agent?.greeting,
      enabledTools: agent?.tools ?? [],
    },
    metadata: scenario.metadata ?? {},
    status: scenario.status,
    endedBy: scenario.endedBy,
    endedAt,
    durationMs,
    turnCount,
    latencyMetrics,
    analysis: {
      summary: scenario.summary,
      sentiment: scenario.sentiment,
      analyzedAt: endedAt + 1500,
    },
    cost:
      engine === 'omni'
        ? omniCost(durationMs, endedAt)
        : pipelineCost({
            promptTokens,
            completionTokens,
            ttsCharacters,
            ttsProvider: agent?.defaultProviders?.tts,
            sttProvider: agent?.defaultProviders?.stt,
            durationMs,
            computedAt: endedAt,
          }),
    callErrors: scenario.errors ?? [],
    createdAt: startedAt,
    updatedAt: endedAt + 1500,
  };

  const conversation = {
    callId: scenario.callId,
    roomName: roomFor(scenario),
    agentId: scenario.agentId,
    participantId: 'user',
    currentStep: 'ended',
    retryCount: 0,
    dynamicVariables: {},
    enabledTools: agent?.tools ?? [],
    systemPrompt: agent?.systemPrompt,
    llmProvider: agent?.defaultProviders?.llm,
    transcriptHistory: transcript,
    llmMessages,
    toolCallHistory,
    lastUserUtterance: [...transcript].reverse().find((t) => t.role === 'user')?.text,
    lastAgentResponse: [...transcript].reverse().find((t) => t.role === 'assistant')?.text,
    startedAt,
    updatedAt: endedAt,
  };

  return { call, events, conversation };
}

function pipelineCost({
  promptTokens,
  completionTokens,
  ttsCharacters,
  ttsProvider,
  sttProvider,
  durationMs,
  computedAt,
}) {
  const llmUsd = round6(
    (promptTokens / 1e6) * LLM_RATE.inputPerMillion +
      (completionTokens / 1e6) * LLM_RATE.outputPerMillion,
  );
  const ttsRate = TTS_RATE_PER_MILLION_CHARS[ttsProvider] ?? 15;
  const ttsUsd = round6((ttsCharacters / 1e6) * ttsRate);
  const seconds = durationMs / 1000;
  const sttUsd = round6((seconds / 60) * STT_RATE_PER_MINUTE);

  return {
    totalUsd: round6(llmUsd + ttsUsd + sttUsd),
    llmUsd,
    ttsUsd,
    sttUsd,
    pricingModel: 'pipeline',
    breakdown: {
      llm: { model: LLM_MODEL, promptTokens, completionTokens, usd: llmUsd },
      tts: { provider: ttsProvider, characters: ttsCharacters, usd: ttsUsd },
      stt: { provider: sttProvider, seconds: round6(seconds), usd: sttUsd },
    },
    estimated: false,
    computedAt,
  };
}

function omniCost(durationMs, computedAt) {
  const omniUsd = round6((durationMs / 1000) * OMNI_RATE_PER_SECOND);
  return {
    totalUsd: omniUsd,
    llmUsd: 0,
    ttsUsd: 0,
    sttUsd: 0,
    omniUsd,
    pricingModel: 'omni',
    breakdown: {
      llm: { promptTokens: 0, completionTokens: 0, usd: 0 },
      tts: { characters: 0, usd: 0 },
      stt: { seconds: round6(durationMs / 1000), usd: 0 },
    },
    estimated: false,
    computedAt,
  };
}

/**
 * Sample calls are positioned relative to now, so the 7-day analytics window
 * always contains them no matter when the repo is cloned.
 */
function timestampFor({ daysAgo = 0, atHour = 12, atMinute = 0 }) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(atHour, atMinute, 0, 0);
  return date.getTime();
}

function roomFor(scenario) {
  return `${scenario.callId}-room`;
}

/** Rough speaking time at ~15 characters per second. */
function speechMs(text) {
  return Math.max(700, Math.round((text.length / 15) * 1000));
}

function tokensFor(text) {
  return Math.ceil(text.length / 4);
}

function percentile(sorted, p) {
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
}

/**
 * Real environment variables win; the .env file is only a fallback so the script
 * works with the same configuration the server uses. Nothing read here is
 * logged.
 */
function readPersistenceConfig() {
  const fromFile = parseEnvFile(resolve(ROOT, '.env'));
  const read = (key) => process.env[key] ?? fromFile[key] ?? '';

  return {
    provider: read('PERSISTENCE_PROVIDER').trim() || 'memory',
    uri: read('MONGODB_URI').trim(),
    dbName: read('MONGODB_DB_NAME').trim(),
  };
}

function parseEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }

  const values = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}
