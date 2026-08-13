import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { CallLogsService } from '../call-logs/call-logs.service';
import { VoiceAgentService } from '../voice-agent/voice-agent.service';

export interface LiveKitRoomInfo {
  name: string;
  sid?: string;
  numParticipants?: number;
  creationTime?: bigint;
}

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private roomClient: RoomServiceClient | null = null;
  private webhookReceiver: WebhookReceiver | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly callLogsService: CallLogsService,
    private readonly voiceAgentService: VoiceAgentService,
  ) {}

  private getRoomClient(): RoomServiceClient {
    if (!this.roomClient) {
      const url = this.configService.get<string>('livekit.url');
      const apiKey = this.configService.get<string>('livekit.apiKey');
      const apiSecret = this.configService.get<string>('livekit.apiSecret');

      if (!url || !apiKey || !apiSecret) {
        throw new BadRequestException(
          'LiveKit credentials not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.',
        );
      }

      this.roomClient = new RoomServiceClient(url, apiKey, apiSecret);
    }
    return this.roomClient;
  }

  private getWebhookReceiver(): WebhookReceiver {
    if (!this.webhookReceiver) {
      const apiKey = this.configService.get<string>('livekit.apiKey');
      const apiSecret = this.configService.get<string>('livekit.apiSecret');

      if (!apiKey || !apiSecret) {
        throw new BadRequestException('LiveKit API credentials not configured');
      }

      this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
    }
    return this.webhookReceiver;
  }

  getLiveKitUrl(): string {
    return this.configService.get<string>('livekit.url') ?? '';
  }

  isSipEnabled(): boolean {
    return this.configService.get<boolean>('livekit.sip.enabled') ?? false;
  }

  getSipConfig() {
    return {
      enabled: this.isSipEnabled(),
      trunkId: this.configService.get<string>('livekit.sip.trunkId') ?? '',
      dispatchRuleId:
        this.configService.get<string>('livekit.sip.dispatchRuleId') ?? '',
    };
  }

  async generateToken(
    roomName: string,
    participantName: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('livekit.apiKey');
    const apiSecret = this.configService.get<string>('livekit.apiSecret');

    if (!apiKey || !apiSecret) {
      throw new BadRequestException(
        'LiveKit API credentials not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
      );
    }

    await this.getOrCreateRoom(roomName);

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    this.logger.log(
      `Generated token for participant "${participantName}" in room "${roomName}"`,
    );
    return token;
  }

  async getOrCreateRoom(roomName: string): Promise<LiveKitRoomInfo> {
    const client = this.getRoomClient();

    try {
      const rooms = await client.listRooms([roomName]);
      if (rooms.length > 0) {
        const room = rooms[0];
        return {
          name: room.name,
          sid: room.sid,
          numParticipants: room.numParticipants,
          creationTime: room.creationTime,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Could not list room "${roomName}", attempting create: ${(error as Error).message}`,
      );
    }

    const room = await client.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 20,
    });

    this.logger.log(`Created LiveKit room: ${roomName}`);
    return {
      name: room.name,
      sid: room.sid,
      numParticipants: room.numParticipants,
      creationTime: room.creationTime,
    };
  }

  async handleWebhook(rawBody: string | Buffer, authHeader?: string) {
    const receiver = this.getWebhookReceiver();
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    let event;
    try {
      event = await receiver.receive(body, authHeader);
    } catch (error) {
      this.logger.error(`Webhook verification failed: ${(error as Error).message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    const roomName = event.room?.name ?? 'unknown';
    const participantId = event.participant?.identity;

    this.logger.log(
      `Webhook event: ${event.event} | room: ${roomName} | participant: ${participantId ?? 'n/a'}`,
    );

    // Route events to voice agent and call logs when applicable
    await this.routeWebhookEvent(event.event, roomName, participantId, event);

    return {
      received: true,
      event: event.event,
      roomName,
      participantId,
    };
  }

  private async routeWebhookEvent(
    eventType: string,
    roomName: string,
    participantId: string | undefined,
    rawEvent: unknown,
  ): Promise<void> {
    const callRecord = await this.callLogsService.getByRoomName(roomName);

    if (callRecord) {
      await this.callLogsService.appendLog(callRecord.callId, 'webhook', {
        roomName,
        participantId,
        data: { eventType, rawEvent },
      });
    }

    switch (eventType) {
      case 'participant_joined':
        if (participantId && !participantId.startsWith('agent-')) {
          await this.voiceAgentService.onParticipantJoined(
            roomName,
            participantId,
          );
        }
        break;
      case 'participant_left':
        if (participantId) {
          await this.voiceAgentService.onParticipantLeft(roomName, participantId);
          // Stop the agent session when the user leaves. Agent-identity
          // participants are filtered so this only fires for real users.
          if (!participantId.startsWith('agent-')) {
            await this.voiceAgentService.stopSession(roomName, 'participant');
          }
        }
        break;
      case 'room_finished':
        await this.voiceAgentService.stopSession(roomName, 'timeout');
        break;
      // SIP-ready: handle track_published, egress, ingress events as needed
      default:
        break;
    }
  }
}
