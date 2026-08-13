import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookEvent,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';
import { CallLogsService } from '../call-logs/call-logs.service';
import { VoiceAgentService } from '../voice-agent/voice-agent.service';
import { AgentsService } from '../agents/agents.service';

/**
 * SIP participants always carry the "sip.callID" attribute set by LiveKit SIP.
 * Checking for this attribute is more robust than comparing the protobuf Kind enum
 * numeric value, which would trigger ESLint's no-unsafe-enum-comparison rule.
 */
const SIP_CALL_ID_ATTR = 'sip.callID';

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
    private readonly agentsService: AgentsService,
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

  async handleWebhook(body: string, authHeader?: string) {
    const receiver = this.getWebhookReceiver();

    let event: WebhookEvent;
    try {
      event = await receiver.receive(body, authHeader);
    } catch (error) {
      this.logger.error(
        `Webhook verification failed: ${(error as Error).message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const roomName = event.room?.name ?? 'unknown';
    const participantId = event.participant?.identity;

    this.logger.log(
      `Webhook event: ${event.event} | room: ${roomName} | participant: ${participantId ?? 'n/a'}`,
    );

    // Route events to voice agent and call logs when applicable
    await this.routeWebhookEvent(event, roomName, participantId);

    return {
      received: true,
      event: event.event,
      roomName,
      participantId,
    };
  }

  /**
   * Returns the agentId to use for an inbound SIP call to the given Twilio DID.
   * Resolution order: DB phone-number field → env phoneNumberMap → "assistant".
   */
  private async resolveAgentIdForDid(calledNumber: string): Promise<string> {
    if (calledNumber) {
      // LiveKit may omit the leading '+' from E.164 numbers — normalise before lookup.
      const normalized = calledNumber.startsWith('+')
        ? calledNumber
        : `+${calledNumber}`;
      this.logger.debug(
        `resolveAgentIdForDid: raw="${calledNumber}" normalized="${normalized}"`,
      );

      const agent = await this.agentsService.findByPhoneNumber(normalized);

      if (agent?.agentId) {
        this.logger.debug(
          `resolveAgentIdForDid: matched agent=${agent.agentId}`,
        );

        return agent.agentId;
      }
      // Also try the raw value in case the DB stored it without '+'.
      if (normalized !== calledNumber) {
        const agentRaw =
          await this.agentsService.findByPhoneNumber(calledNumber);

        if (agentRaw?.agentId) {
          this.logger.debug(
            `resolveAgentIdForDid: matched agent (raw)=${agentRaw.agentId}`,
          );

          return agentRaw.agentId;
        }
      }
      this.logger.warn(
        `resolveAgentIdForDid: no agent found for "${normalized}" — falling back to map/default`,
      );
    }
    const map =
      this.configService.get<Record<string, string>>(
        'livekit.sip.phoneNumberMap',
      ) ?? {};
    return map[calledNumber] ?? map['default'] ?? 'assistant';
  }

  /**
   * Start the voice agent for an inbound SIP call if no session exists yet.
   * Fire-and-forget — mirrors the browser flow in SessionService.
   */
  private startSipAgentSession(
    roomName: string,
    callerNumber: string,
    calledNumber: string,
  ): void {
    const callId = uuidv4();
    void this.resolveAgentIdForDid(calledNumber)
      .then((agentId) => {
        this.logger.log(
          `SIP inbound call: room=${roomName} from=${callerNumber} to=${calledNumber} → agent=${agentId}`,
        );
        return this.voiceAgentService.startSession(
          roomName,
          callId,
          { agentId },
          {
            direction: 'inbound',
            channel: 'pstn',
            from: callerNumber,
            to: calledNumber,
          },
        );
      })
      .catch((error: Error) => {
        // ConflictException is expected when the webhook fires a duplicate
        // participant_joined event — the session is already running, so ignore it.
        if ((error as { status?: number }).status === 409) return;
        this.logger.error(
          `SIP agent bring-up failed for room "${roomName}": ${error.message}`,
        );
      });
  }

  private async routeWebhookEvent(
    event: WebhookEvent,
    roomName: string,
    participantId: string | undefined,
  ): Promise<void> {
    const eventType = event.event;
    const callRecord = await this.callLogsService.getByRoomName(roomName);

    if (callRecord) {
      await this.callLogsService.appendLog(callRecord.callId, 'webhook', {
        roomName,
        participantId,
        data: { eventType },
      });
    }

    const participant = event.participant;

    switch (eventType) {
      case 'participant_joined': {
        if (!participantId || participantId.startsWith('agent-')) break;

        const isSip =
          typeof participant?.attributes?.[SIP_CALL_ID_ATTR] === 'string';

        if (isSip) {
          // SIP inbound: room was created by the LiveKit dispatch rule, so
          // there is no pre-started agent session. Bootstrap it now.
          const attrs = participant?.attributes ?? {};
          const callerNumber = attrs['sip.phoneNumber'] ?? '';
          const calledNumber = attrs['sip.trunkPhoneNumber'] ?? '';
          this.startSipAgentSession(roomName, callerNumber, calledNumber);
        } else {
          // Browser participant: session was pre-started by POST /session/start.
          await this.voiceAgentService.onParticipantJoined(
            roomName,
            participantId,
          );
        }
        break;
      }

      case 'participant_left':
        if (participantId) {
          await this.voiceAgentService.onParticipantLeft(
            roomName,
            participantId,
          );
          if (!participantId.startsWith('agent-')) {
            await this.voiceAgentService.stopSession(roomName, 'participant');
          }
        }
        break;

      case 'room_finished':
        await this.voiceAgentService.stopSession(roomName, 'timeout');
        break;

      default:
        break;
    }
  }
}
