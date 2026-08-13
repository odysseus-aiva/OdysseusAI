import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { GenerateTokenDto, TokenResponseDto } from './dto/generate-token.dto';
import { LivekitService } from './livekit.service';

@Controller('livekit')
export class LivekitController {
  constructor(private readonly livekitService: LivekitService) {}

  @Post('token')
  async generateToken(
    @Body() dto: GenerateTokenDto,
  ): Promise<TokenResponseDto> {
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
    // LiveKit sends Content-Type: application/webhook+json which NestJS's JSON
    // body parser does not recognize. The express.raw({type:'*/*'}) middleware
    // in main.ts captures the body as a Buffer in req.rawBody (via NestJS
    // rawBody:true) or in req.body. Convert to string before verification so
    // the HMAC digest is computed over the exact original bytes.
    const rawBody = liveKitBodyToString(req);
    return this.livekitService.handleWebhook(rawBody, authHeader);
  }
}

function liveKitBodyToString(req: RawBodyRequest<Request>): string {
  if (req.rawBody) return req.rawBody.toString('utf8');
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body !== undefined) return JSON.stringify(req.body as object);
  return '';
}
