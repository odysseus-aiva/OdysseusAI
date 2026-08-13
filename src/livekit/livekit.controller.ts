import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GenerateTokenDto, TokenResponseDto } from './dto/generate-token.dto';
import { LivekitService } from './livekit.service';

@Controller('livekit')
export class LivekitController {
  constructor(private readonly livekitService: LivekitService) {}

  @Post('token')
  async generateToken(@Body() dto: GenerateTokenDto): Promise<TokenResponseDto> {
    const token = await this.livekitService.generateToken(
      dto.roomName,
      dto.participantName,
      dto.metadata,
    );

    return {
      token,
      roomName: dto.roomName,
      participantName: dto.participantName,
      livekitUrl: this.livekitService.getLiveKitUrl(),
    };
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader?: string,
  ) {
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    return this.livekitService.handleWebhook(rawBody, authHeader);
  }
}
