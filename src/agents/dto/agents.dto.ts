import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AgentEngine } from '../interfaces/agent.types';

const AGENT_ENGINES: AgentEngine[] = ['pipeline', 'omni'];

export class AgentProvidersDto {
  @IsOptional()
  @IsString()
  stt?: string;

  @IsOptional()
  @IsString()
  llm?: string;

  @IsOptional()
  @IsString()
  tts?: string;
}

export class CreateAgentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  agentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(AGENT_ENGINES)
  engine?: AgentEngine;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentProvidersDto)
  defaultProviders?: AgentProvidersDto;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(AGENT_ENGINES)
  engine?: AgentEngine;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentProvidersDto)
  defaultProviders?: AgentProvidersDto;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class UpsertAgentToolDto {
  @IsString()
  toolName!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpsertAgentToolsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAgentToolDto)
  tools!: UpsertAgentToolDto[];
}

export class TestAgentToolDto {
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
