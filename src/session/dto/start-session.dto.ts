import { Type } from 'class-transformer';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { AgentConfigDto } from '../../voice-agent/dto/start-voice-agent.dto';

/**
 * Client-facing request to begin a voice session. Intentionally minimal — the
 * client never supplies room names, call IDs, or tokens. Everything is
 * generated server-side. `agentConfig` is optional and forward-compatible with
 * future features (agent selection, prompt overrides, tool toggles).
 */
export class StartSessionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigDto)
  agentConfig?: AgentConfigDto;

  /** Arbitrary caller-supplied metadata (userId, planTier, etc.) stored on the call record. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string | number | boolean>;
}

/**
 * The single opaque envelope the frontend needs to connect. It exposes no
 * backend implementation detail beyond what the LiveKit client SDK requires.
 */
export interface StartSessionResponse {
  serverUrl: string;
  token: string;
  roomName: string;
  callId: string;
  participantIdentity: string;
  agentIdentity: string;
}
