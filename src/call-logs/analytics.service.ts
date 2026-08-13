import { Inject, Injectable } from '@nestjs/common';
import { CallLogEntry } from '../common/types/call-log.types';
import { classifyOutcome } from '../common/utils/call-outcome.util';
import {
  CALL_LOGS_REPOSITORY,
  type CallLogsRepository,
  type CallSummary,
} from './interfaces/call-logs-repository.interface';

/** Upper bound on calls pulled into a single aggregation window. */
const MAX_CALLS_PER_WINDOW = 2000;
/** Upper bound on events pulled into a single aggregation window. */
const MAX_EVENTS_PER_WINDOW = 20000;
/**
 * Minimum turns before latency percentiles are considered meaningful. Below
 * this the API still returns the numbers but flags them, so the UI can warn
 * instead of presenting a single sample as a distribution.
 */
const MIN_LATENCY_SAMPLE = 20;
/** Response-latency budget used for the "within budget" share. */
const LATENCY_BUDGET_MS = 1500;

const LATENCY_BUCKETS: Array<{ label: string; from: number; to: number }> = [
  { label: '0–500ms', from: 0, to: 500 },
  { label: '500ms–1s', from: 500, to: 1000 },
  { label: '1–1.5s', from: 1000, to: 1500 },
  { label: '1.5–2.5s', from: 1500, to: 2500 },
  { label: '2.5–5s', from: 2500, to: 5000 },
  { label: '5–10s', from: 5000, to: 10000 },
  { label: '10s+', from: 10000, to: Number.POSITIVE_INFINITY },
];

interface LatencyTurn {
  callId: string;
  timestamp: number;
  turnIndex?: number;
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  ttsLatencyMs?: number;
  totalResponseLatencyMs?: number;
}

interface WindowQuery {
  period: number;
  agentId?: string;
}

/**
 * Read-only aggregation over stored calls and call events.
 *
 * Kept separate from `CallLogsService` (which owns the write path) because the
 * shapes here are driven by dashboard surfaces rather than by the call
 * lifecycle, and because every method is a pure fan-out read.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(CALL_LOGS_REPOSITORY)
    private readonly repository: CallLogsRepository,
  ) {}

  /**
   * Headline stats for the dashboard and analytics surfaces.
   *
   * Legacy flat fields (`totalCalls`, `callsPerDay`, `topTools`, …) are
   * retained alongside the grouped additions so existing clients keep working.
   */
  async getStats(query: WindowQuery) {
    const { period, agentId } = query;
    const to = Date.now();
    const from = to - period * DAY_MS;
    const prevFrom = from - period * DAY_MS;

    const [calls, total, prevCalls] = await Promise.all([
      this.listWindow(from, agentId),
      this.repository.countAll({ agentId, startAfter: from }),
      this.listWindow(prevFrom, agentId, from),
    ]);

    const turns = await this.loadLatencyTurns(calls);
    const prevTurns = await this.loadLatencyTurns(prevCalls);

    const current = summarize(calls, turns);
    const previous = summarize(prevCalls, prevTurns);

    const toolEvents = await this.loadEvents(calls, ['tool_call']);
    const toolCounts = new Map<string, number>();
    for (const event of toolEvents) {
      const name = readToolName(event);
      if (name) toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
    }
    const topTools = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const bucket: 'day' | 'week' = period > 31 ? 'week' : 'day';
    const series = buildSeries(calls, from, to, bucket);

    return {
      period,
      from,
      to,

      // --- Legacy flat shape, still consumed by existing clients ---
      totalCalls: total,
      completedCalls: current.completed,
      errorCalls: current.failed,
      inProgressCalls: current.inProgress,
      avgDurationMs: current.avgDurationMs,
      avgLatencyMs: current.latency.avg,
      p50LatencyMs: current.latency.p50,
      p95LatencyMs: current.latency.p95,
      errorRate: current.errorRate,
      totalCostUsd: current.cost.totalUsd,
      avgCostUsd: current.cost.avgUsd,
      callsPerDay: series.map((p) => ({ date: p.date, count: p.total })),
      topTools,

      // --- Conversation quality, distinct from process errors ---
      outcomeMix: [
        { outcome: 'engaged', count: current.engaged },
        { outcome: 'no_interaction', count: current.noInteraction },
        { outcome: 'failed', count: current.failed },
        { outcome: 'in_progress', count: current.inProgress },
      ],
      engagementRate: current.engagementRate,
      avgTurnCount: current.avgTurnCount,
      turnHistogram: current.turnHistogram,

      endedByMix: toMix(current.endedBy),
      sentimentMix: toMix(current.sentiment),

      costBreakdown: current.cost.breakdown,
      unitEconomics: current.cost.unitEconomics,

      topAgents: current.agents,

      /**
       * Denominator behind every aggregate above. The UI suppresses or flags
       * statistics whose sample is too small to be meaningful.
       */
      samples: {
        calls: calls.length,
        latencyTurns: current.latency.samples,
        costedCalls: current.cost.costedCalls,
        analyzedCalls: current.sentimentSample,
        latencyReliable: current.latency.samples >= MIN_LATENCY_SAMPLE,
        minLatencySample: MIN_LATENCY_SAMPLE,
      },

      /** Change versus the equally-sized window immediately before this one. */
      deltas: {
        totalCalls: delta(calls.length, prevCalls.length),
        engagementRate: delta(current.engagementRate, previous.engagementRate),
        errorRate: delta(current.errorRate, previous.errorRate),
        p50LatencyMs: delta(current.latency.p50, previous.latency.p50),
        avgCostUsd: delta(current.cost.avgUsd, previous.cost.avgUsd),
        avgDurationMs: delta(current.avgDurationMs, previous.avgDurationMs),
      },

      series: { bucket, points: series },
    };
  }

  /**
   * Turn-level latency analytics.
   *
   * Percentiles are computed across individual turns rather than across
   * per-call medians, which is what makes p50/p95 mean what they claim to.
   */
  async getLatency(query: WindowQuery) {
    const { period, agentId } = query;
    const to = Date.now();
    const from = to - period * DAY_MS;

    const calls = await this.listWindow(from, agentId);
    const turns = await this.loadLatencyTurns(calls);
    const interruptions = await this.loadEvents(calls, ['agent_interrupted']);

    const totals = turns
      .map((t) => t.totalResponseLatencyMs)
      .filter(isNumber)
      .sort((a, b) => a - b);

    const stt = statsFor(turns.map((t) => t.sttLatencyMs));
    const llm = statsFor(turns.map((t) => t.llmLatencyMs));
    const tts = statsFor(turns.map((t) => t.ttsLatencyMs));

    // Turns where every stage plus the end-to-end total is present are the only
    // ones that can attribute the gap between them.
    const attributable = turns.filter(
      (t) =>
        isNumber(t.totalResponseLatencyMs) &&
        isNumber(t.sttLatencyMs) &&
        isNumber(t.llmLatencyMs) &&
        isNumber(t.ttsLatencyMs),
    );
    const unaccounted = attributable.map(
      (t) =>
        t.totalResponseLatencyMs! -
        (t.sttLatencyMs! + t.llmLatencyMs! + t.ttsLatencyMs!),
    );
    const unaccountedAvg = mean(unaccounted);
    const totalAvg = mean(attributable.map((t) => t.totalResponseLatencyMs!));

    const byTurnIndex = groupBy(
      turns.filter(
        (t) => isNumber(t.turnIndex) && isNumber(t.totalResponseLatencyMs),
      ),
      (t) => String(t.turnIndex),
    )
      .map(([key, group]) => ({
        turnIndex: Number(key),
        p50: percentile(
          group.map((g) => g.totalResponseLatencyMs!).sort((a, b) => a - b),
          50,
        ),
        avg: mean(group.map((g) => g.totalResponseLatencyMs!)),
        samples: group.length,
      }))
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .slice(0, 20);

    const bucket: 'day' | 'week' = period > 31 ? 'week' : 'day';
    const overTime = groupBy(
      turns.filter((t) => isNumber(t.totalResponseLatencyMs)),
      (t) => bucketKey(t.timestamp, from, bucket),
    )
      .map(([date, group]) => {
        const sorted = group
          .map((g) => g.totalResponseLatencyMs!)
          .sort((a, b) => a - b);
        return {
          date,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          samples: sorted.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const withinBudget = totals.filter((v) => v <= LATENCY_BUDGET_MS).length;

    return {
      period,
      from,
      to,
      samples: {
        turns: totals.length,
        calls: calls.length,
        reliable: totals.length >= MIN_LATENCY_SAMPLE,
        minSample: MIN_LATENCY_SAMPLE,
      },
      percentiles: totals.length
        ? {
            avg: mean(totals),
            p50: percentile(totals, 50),
            p75: percentile(totals, 75),
            p90: percentile(totals, 90),
            p95: percentile(totals, 95),
            p99: percentile(totals, 99),
            min: totals[0],
            max: totals[totals.length - 1],
          }
        : null,
      stages: {
        stt,
        llm,
        tts,
        unaccounted: {
          avg: unaccountedAvg,
          samples: unaccounted.length,
          /** Share of end-to-end latency not attributable to STT, LLM or TTS. */
          sharePct:
            unaccountedAvg !== null && totalAvg !== null && totalAvg > 0
              ? Math.round((unaccountedAvg / totalAvg) * 1000) / 10
              : null,
        },
      },
      histogram: LATENCY_BUCKETS.map((b) => ({
        label: b.label,
        fromMs: b.from,
        toMs: Number.isFinite(b.to) ? b.to : null,
        count: totals.filter((v) => v >= b.from && v < b.to).length,
      })),
      byTurnIndex,
      overTime,
      budget: {
        thresholdMs: LATENCY_BUDGET_MS,
        withinCount: withinBudget,
        breachedCount: totals.length - withinBudget,
        withinPct: totals.length
          ? Math.round((withinBudget / totals.length) * 1000) / 10
          : null,
      },
      interruptions: {
        count: interruptions.length,
        callsAffected: new Set(interruptions.map((e) => e.callId)).size,
        perCall: calls.length
          ? Math.round((interruptions.length / calls.length) * 100) / 100
          : null,
      },
    };
  }

  /**
   * Tool analytics from actual executions.
   *
   * Deliberately returns names, counts and timings only — tool arguments,
   * outputs and error strings can contain caller-supplied or third-party data
   * and are never surfaced through an aggregate endpoint.
   */
  async getTools(query: WindowQuery) {
    const { period, agentId } = query;
    const to = Date.now();
    const from = to - period * DAY_MS;

    const calls = await this.listWindow(from, agentId);
    const events = await this.loadEvents(calls, ['tool_call', 'tool_result']);

    const perTool = new Map<
      string,
      {
        invocations: number;
        successes: number;
        failures: number;
        latencies: number[];
      }
    >();
    const callsWithTools = new Set<string>();

    for (const event of events) {
      const name = readToolName(event);
      if (!name) continue;

      const entry = perTool.get(name) ?? {
        invocations: 0,
        successes: 0,
        failures: 0,
        latencies: [],
      };

      if (event.step === 'tool_call') {
        entry.invocations += 1;
        callsWithTools.add(event.callId);
      } else {
        const data = event.data as { success?: boolean } | undefined;
        if (data?.success === false || event.error) entry.failures += 1;
        else entry.successes += 1;
        if (isNumber(event.latencyMs)) entry.latencies.push(event.latencyMs);
      }

      perTool.set(name, entry);
    }

    const tools = [...perTool.entries()]
      .map(([name, entry]) => {
        const sorted = [...entry.latencies].sort((a, b) => a - b);
        const resolved = entry.successes + entry.failures;
        return {
          name,
          invocations: entry.invocations,
          successes: entry.successes,
          failures: entry.failures,
          successRate: resolved ? entry.successes / resolved : null,
          avgLatencyMs: mean(sorted),
          p95LatencyMs: sorted.length ? percentile(sorted, 95) : null,
        };
      })
      .sort((a, b) => b.invocations - a.invocations);

    const totalInvocations = tools.reduce((sum, t) => sum + t.invocations, 0);
    const totalFailures = tools.reduce((sum, t) => sum + t.failures, 0);
    const totalResolved = tools.reduce(
      (sum, t) => sum + t.successes + t.failures,
      0,
    );

    return {
      period,
      from,
      to,
      samples: { calls: calls.length, invocations: totalInvocations },
      totals: {
        invocations: totalInvocations,
        failures: totalFailures,
        successRate: totalResolved
          ? (totalResolved - totalFailures) / totalResolved
          : null,
        callsWithTools: callsWithTools.size,
        adoptionRate: calls.length ? callsWithTools.size / calls.length : null,
        invocationsPerCall: calls.length
          ? Math.round((totalInvocations / calls.length) * 100) / 100
          : null,
      },
      tools,
    };
  }

  private async listWindow(
    startAfter: number,
    agentId?: string,
    startBefore?: number,
  ): Promise<CallSummary[]> {
    return this.repository.listSummaries({
      limit: MAX_CALLS_PER_WINDOW,
      offset: 0,
      agentId,
      startAfter,
      startBefore,
      sortBy: 'createdAt',
      order: 'asc',
    });
  }

  private async loadEvents(
    calls: CallSummary[],
    steps: string[],
  ): Promise<CallLogEntry[]> {
    if (!calls.length) return [];
    return this.repository.listEventsForCalls(
      calls.map((c) => c.callId),
      steps,
      MAX_EVENTS_PER_WINDOW,
    );
  }

  private async loadLatencyTurns(calls: CallSummary[]): Promise<LatencyTurn[]> {
    const events = await this.loadEvents(calls, ['latency_snapshot']);
    return events.map((event) => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      return {
        callId: event.callId,
        timestamp: event.timestamp,
        turnIndex: numberOrUndefined(data.turnIndex),
        sttLatencyMs: numberOrUndefined(data.sttLatencyMs),
        llmLatencyMs: numberOrUndefined(data.llmLatencyMs),
        ttsLatencyMs: numberOrUndefined(data.ttsLatencyMs),
        totalResponseLatencyMs: numberOrUndefined(data.totalResponseLatencyMs),
      };
    });
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function summarize(calls: CallSummary[], turns: LatencyTurn[]) {
  const outcomes = calls.map((c) => classifyOutcome(c));
  const engaged = outcomes.filter((o) => o === 'engaged').length;
  const noInteraction = outcomes.filter((o) => o === 'no_interaction').length;
  const failed = outcomes.filter((o) => o === 'failed').length;
  const inProgress = outcomes.filter((o) => o === 'in_progress').length;
  const completed = calls.filter((c) => c.status === 'completed').length;

  const durations = calls.map((c) => c.durationMs).filter(isNumber);
  const turnCounts = calls.map((c) => c.turnCount ?? 0);

  const latencies = turns
    .map((t) => t.totalResponseLatencyMs)
    .filter(isNumber)
    .sort((a, b) => a - b);

  const costed = calls.filter((c) => c.cost?.totalUsd != null);
  const totalUsd = costed.reduce((sum, c) => sum + (c.cost!.totalUsd || 0), 0);
  const llmUsd = costed.reduce((sum, c) => sum + (c.cost!.llmUsd || 0), 0);
  const ttsUsd = costed.reduce((sum, c) => sum + (c.cost!.ttsUsd || 0), 0);
  const sttUsd = costed.reduce((sum, c) => sum + (c.cost!.sttUsd || 0), 0);
  const estimated = costed.filter((c) => c.cost!.estimated).length;
  const billedMinutes = durations.reduce((sum, d) => sum + d, 0) / 60000;
  const totalTurns = turnCounts.reduce((sum, t) => sum + t, 0);

  const endedBy = new Map<string, number>();
  for (const call of calls) {
    const key = call.endedBy ?? 'unknown';
    endedBy.set(key, (endedBy.get(key) ?? 0) + 1);
  }

  const sentiment = new Map<string, number>();
  let sentimentSample = 0;
  for (const call of calls) {
    const value = call.analysis?.sentiment;
    if (!value) continue;
    sentimentSample += 1;
    sentiment.set(value, (sentiment.get(value) ?? 0) + 1);
  }

  const agents = groupBy(
    calls.filter((c) => c.agentId),
    (c) => c.agentId!,
  )
    .map(([agentId, group]) => {
      const groupCosted = group.filter((c) => c.cost?.totalUsd != null);
      const groupEngaged = group.filter(
        (c) => classifyOutcome(c) === 'engaged',
      ).length;
      return {
        agentId,
        name: group.find((c) => c.agentSnapshot?.name)?.agentSnapshot?.name,
        llmModel: group.find((c) => c.agentSnapshot?.llmModel)?.agentSnapshot
          ?.llmModel,
        calls: group.length,
        engagementRate: group.length ? groupEngaged / group.length : 0,
        avgCostUsd: groupCosted.length
          ? round6(
              groupCosted.reduce((s, c) => s + c.cost!.totalUsd, 0) /
                groupCosted.length,
            )
          : null,
        avgDurationMs: mean(group.map((c) => c.durationMs).filter(isNumber)),
      };
    })
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  return {
    completed,
    engaged,
    noInteraction,
    failed,
    inProgress,
    errorRate: calls.length ? failed / calls.length : 0,
    engagementRate: calls.length ? engaged / calls.length : 0,
    avgDurationMs: mean(durations),
    avgTurnCount: turnCounts.length
      ? Math.round(
          (turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length) * 100,
        ) / 100
      : null,
    turnHistogram: buildTurnHistogram(turnCounts),
    endedBy,
    sentiment,
    sentimentSample,
    latency: {
      avg: mean(latencies),
      p50: latencies.length ? percentile(latencies, 50) : null,
      p95: latencies.length ? percentile(latencies, 95) : null,
      samples: latencies.length,
    },
    cost: {
      totalUsd: round6(totalUsd),
      avgUsd: costed.length ? round6(totalUsd / costed.length) : null,
      costedCalls: costed.length,
      breakdown: {
        llmUsd: round6(llmUsd),
        ttsUsd: round6(ttsUsd),
        sttUsd: round6(sttUsd),
        estimatedCalls: estimated,
        estimatedShare: costed.length ? estimated / costed.length : null,
      },
      unitEconomics: {
        perCallUsd: costed.length ? round6(totalUsd / costed.length) : null,
        perMinuteUsd:
          billedMinutes > 0 ? round6(totalUsd / billedMinutes) : null,
        perTurnUsd: totalTurns > 0 ? round6(totalUsd / totalTurns) : null,
      },
    },
    agents,
  };
}

function buildTurnHistogram(turnCounts: number[]) {
  const buckets = [
    { label: '0', min: 0, max: 0 },
    { label: '1', min: 1, max: 1 },
    { label: '2–3', min: 2, max: 3 },
    { label: '4–6', min: 4, max: 6 },
    { label: '7–10', min: 7, max: 10 },
    { label: '11+', min: 11, max: Number.POSITIVE_INFINITY },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: turnCounts.filter((t) => t >= b.min && t <= b.max).length,
  }));
}

function buildSeries(
  calls: CallSummary[],
  from: number,
  to: number,
  bucket: 'day' | 'week',
) {
  const step = bucket === 'week' ? 7 * DAY_MS : DAY_MS;
  const points = new Map<
    string,
    {
      date: string;
      total: number;
      engaged: number;
      noInteraction: number;
      failed: number;
      costUsd: number;
    }
  >();

  for (let t = from; t <= to; t += step) {
    const key = bucketKey(t, from, bucket);
    points.set(key, {
      date: key,
      total: 0,
      engaged: 0,
      noInteraction: 0,
      failed: 0,
      costUsd: 0,
    });
  }

  for (const call of calls) {
    const key = bucketKey(call.createdAt, from, bucket);
    const point = points.get(key) ?? {
      date: key,
      total: 0,
      engaged: 0,
      noInteraction: 0,
      failed: 0,
      costUsd: 0,
    };
    point.total += 1;
    const outcome = classifyOutcome(call);
    if (outcome === 'engaged') point.engaged += 1;
    else if (outcome === 'no_interaction') point.noInteraction += 1;
    else if (outcome === 'failed') point.failed += 1;
    point.costUsd += call.cost?.totalUsd ?? 0;
    points.set(key, point);
  }

  return [...points.values()]
    .map((p) => ({ ...p, costUsd: round6(p.costUsd) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Day buckets use the calendar date; week buckets anchor to the window start. */
function bucketKey(
  timestamp: number,
  from: number,
  bucket: 'day' | 'week',
): string {
  if (bucket === 'day') return new Date(timestamp).toISOString().slice(0, 10);
  const weeks = Math.floor((timestamp - from) / (7 * DAY_MS));
  return new Date(from + weeks * 7 * DAY_MS).toISOString().slice(0, 10);
}

function statsFor(values: Array<number | undefined>) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  return {
    avg: mean(sorted),
    p50: sorted.length ? percentile(sorted, 50) : null,
    p95: sorted.length ? percentile(sorted, 95) : null,
    samples: sorted.length,
  };
}

function toMix(counts: Map<string, number>) {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Absolute and relative change, or null when there is no prior baseline. */
function delta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const absolute = current - previous;
  return {
    current,
    previous,
    absolute: Math.round(absolute * 1e6) / 1e6,
    pct: previous !== 0 ? Math.round((absolute / previous) * 1000) / 10 : null,
  };
}

function readToolName(event: CallLogEntry): string | null {
  const data = event.data as { toolName?: unknown } | undefined;
  return typeof data?.toolName === 'string' ? data.toolName : null;
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()];
}

/** Linear-interpolated percentile over an ascending-sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOrUndefined(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
