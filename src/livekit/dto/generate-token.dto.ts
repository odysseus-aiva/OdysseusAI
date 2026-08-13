import { IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateTokenDto {
  @IsString()
  roomName: string;

  @IsString()
  participantName: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class TokenResponseDto {
  token: string;
  roomName: string;
  participantName: string;
  livekitUrl: string;
}
