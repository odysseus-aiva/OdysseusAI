export interface ToolExecutionContext {
  callId: string;
  roomName: string;
  participantId?: string;
  agentId?: string;
  dynamicVariables: Record<string, string>;
  metadata: Record<string, unknown>;
  /** Per-agent tool configs keyed by tool name */
  toolConfigs?: Record<string, Record<string, unknown>>;
}
