export interface LatencyMetrics {
  userSpeechStart?: number;
  userSpeechEnd?: number;
  sttFinalTranscript?: number;
  llmStart?: number;
  llmEnd?: number;
  ttsStart?: number;
  ttsEnd?: number;
  agentPlaybackStart?: number;
  totalResponseLatencyMs?: number;
  /** stt_final_transcript - user_speech_end (ms) */
  sttLatencyMs?: number;
  /** llm_end - llm_start (ms) */
  llmLatencyMs?: number;
  /** tts_end - tts_start (ms) */
  ttsLatencyMs?: number;
  /** p50 totalResponseLatencyMs across all completed turns in the call */
  p50ResponseLatencyMs?: number;
  /** p95 totalResponseLatencyMs across all completed turns in the call */
  p95ResponseLatencyMs?: number;
  /** Number of turns that contributed to p50/p95 */
  turnsWithLatency?: number;
}

export type PerformanceMilestone =
  | 'user_speech_start'
  | 'user_speech_end'
  | 'stt_final_transcript'
  | 'llm_start'
  | 'llm_end'
  | 'tts_start'
  | 'tts_end'
  | 'agent_playback_start';

export interface PerformanceRecord {
  callId: string;
  milestones: Partial<Record<PerformanceMilestone, number>>;
  latencyMetrics: LatencyMetrics;
  /** totalResponseLatencyMs committed after each completed (non-interrupted) turn. */
  turnLatencies?: number[];
}
