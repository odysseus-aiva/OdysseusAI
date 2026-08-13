import { Injectable, Logger } from '@nestjs/common';
import {
  LatencyMetrics,
  PerformanceMilestone,
  PerformanceRecord,
} from '../common/types/performance.types';

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly records = new Map<string, PerformanceRecord>();

  getOrCreate(callId: string): PerformanceRecord {
    let record = this.records.get(callId);
    if (!record) {
      record = {
        callId,
        milestones: {},
        latencyMetrics: {},
        turnLatencies: [],
      };
      this.records.set(callId, record);
    }
    return record;
  }

  recordMilestone(callId: string, milestone: PerformanceMilestone): LatencyMetrics {
    const record = this.getOrCreate(callId);
    const now = Date.now();
    record.milestones[milestone] = now;

    switch (milestone) {
      case 'user_speech_start':
        record.latencyMetrics.userSpeechStart = now;
        break;
      case 'user_speech_end':
        record.latencyMetrics.userSpeechEnd = now;
        break;
      case 'stt_final_transcript':
        record.latencyMetrics.sttFinalTranscript = now;
        break;
      case 'llm_start':
        record.latencyMetrics.llmStart = now;
        break;
      case 'llm_end':
        record.latencyMetrics.llmEnd = now;
        break;
      case 'tts_start':
        record.latencyMetrics.ttsStart = now;
        break;
      case 'tts_end':
        record.latencyMetrics.ttsEnd = now;
        break;
      case 'agent_playback_start':
        record.latencyMetrics.agentPlaybackStart = now;
        break;
    }

    record.latencyMetrics = this.calculateLatency(record);
    this.logger.debug(
      `Milestone [${callId}] ${milestone} @ ${now} — total latency: ${record.latencyMetrics.totalResponseLatencyMs ?? 'n/a'}ms`,
    );
    return { ...record.latencyMetrics };
  }

  /**
   * Called after each completed agent response turn (TTS done, not interrupted).
   * Stores the turn's totalResponseLatencyMs for p50/p95 computation at call end.
   * Returns the per-turn latency data for emitting as a latency_snapshot event.
   */
  commitTurnLatency(callId: string): {
    sttLatencyMs?: number;
    llmLatencyMs?: number;
    ttsLatencyMs?: number;
    totalResponseLatencyMs?: number;
  } {
    const record = this.records.get(callId);
    if (!record) return {};

    const metrics = this.calculateLatency(record);
    if (metrics.totalResponseLatencyMs !== undefined) {
      record.turnLatencies = record.turnLatencies ?? [];
      record.turnLatencies.push(metrics.totalResponseLatencyMs);
    }

    // Reset per-turn milestones so next turn starts clean.
    record.milestones = {};
    record.latencyMetrics = {
      // Preserve accumulated p50/p95 fields across turns.
      p50ResponseLatencyMs: record.latencyMetrics.p50ResponseLatencyMs,
      p95ResponseLatencyMs: record.latencyMetrics.p95ResponseLatencyMs,
      turnsWithLatency: record.latencyMetrics.turnsWithLatency,
    };

    return {
      sttLatencyMs: metrics.sttLatencyMs,
      llmLatencyMs: metrics.llmLatencyMs,
      ttsLatencyMs: metrics.ttsLatencyMs,
      totalResponseLatencyMs: metrics.totalResponseLatencyMs,
    };
  }

  /**
   * Computes p50/p95 from all committed turn latencies.
   * Returns the full LatencyMetrics including aggregates, ready to persist on the call.
   */
  getFinalMetrics(callId: string): LatencyMetrics {
    const record = this.records.get(callId);
    if (!record) return {};

    const current = this.calculateLatency(record);
    const turns = record.turnLatencies ?? [];

    if (turns.length === 0) return current;

    const sorted = [...turns].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);

    return {
      ...current,
      p50ResponseLatencyMs: p50,
      p95ResponseLatencyMs: p95,
      turnsWithLatency: turns.length,
    };
  }

  calculateLatency(record: PerformanceRecord): LatencyMetrics {
    const m = record.milestones;
    const metrics: LatencyMetrics = { ...record.latencyMetrics };

    if (m.user_speech_end && m.stt_final_transcript) {
      metrics.sttLatencyMs = m.stt_final_transcript - m.user_speech_end;
    }

    if (m.llm_start && m.llm_end) {
      metrics.llmLatencyMs = m.llm_end - m.llm_start;
    }

    if (m.tts_start && m.tts_end) {
      metrics.ttsLatencyMs = m.tts_end - m.tts_start;
    }

    if (m.user_speech_end && m.agent_playback_start) {
      metrics.totalResponseLatencyMs = m.agent_playback_start - m.user_speech_end;
    } else if (m.user_speech_end && m.tts_end) {
      metrics.totalResponseLatencyMs = m.tts_end - m.user_speech_end;
    }

    return metrics;
  }

  getMetrics(callId: string): LatencyMetrics | null {
    const record = this.records.get(callId);
    if (!record) return null;
    return { ...record.latencyMetrics };
  }

  getRecord(callId: string): PerformanceRecord | null {
    const record = this.records.get(callId);
    return record ? { ...record, milestones: { ...record.milestones } } : null;
  }

  getSegmentLatency(
    callId: string,
    start: PerformanceMilestone,
    end: PerformanceMilestone,
  ): number | null {
    const record = this.records.get(callId);
    if (!record) return null;
    const startTime = record.milestones[start];
    const endTime = record.milestones[end];
    if (startTime === undefined || endTime === undefined) return null;
    return endTime - startTime;
  }

  clearRecord(callId: string): void {
    this.records.delete(callId);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}
