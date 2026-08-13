export type TurnEventType =
  | 'user_speech_start'
  | 'user_speech_end'
  | 'user_turn_complete'
  | 'agent_speech_start'
  | 'agent_speech_end';

export interface TurnDecision {
  type: TurnEventType;
  timestamp: number;
  transcript?: string;
  reason?: string;
  confidence?: number;
}
