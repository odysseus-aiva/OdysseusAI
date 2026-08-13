import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AgentConfig } from '../../common/types/voice-agent.types';

export class AgentConfigDto implements AgentConfig {
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  sttProvider?: string;

  @IsOptional()
  @IsString()
  llmProvider?: string;

  @IsOptional()
  @IsString()
  ttsProvider?: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  turnSilenceMs?: number;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsObject()
  dynamicVariables?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[];
}

export class StartVoiceAgentDto {
  @IsString()
  roomName: string;

  @IsString()
  callId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigDto)
  agentConfig?: AgentConfigDto;
}
