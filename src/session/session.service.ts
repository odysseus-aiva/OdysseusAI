import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig } from '../common/types/voice-agent.types';
import { LivekitService } from '../livekit/livekit.service';
import { VoiceAgentService } from '../voice-agent/voice-agent.service';
import { StartSessionResponse } from './dto/start-session.dto';

/**
 * Orchestrates everything a client needs to begin talking in ONE call:
 *   1. Generate a room name + call ID (never exposed as inputs).
 *   2. Ensure the LiveKit room exists and mint the user's access token.
 *   3. Kick off the server-side voice agent WITHOUT blocking — the agent waits
 *      for the browser to subscribe in the background, so this returns the
 *      token immediately (avoids the token/subscription deadlock).
 *
 * The frontend receives an opaque connection envelope and nothing else.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly livekitService: LivekitService,
    private readonly voiceAgentService: VoiceAgentService,
  ) {}

  async startSession(
    agentConfig?: AgentConfig,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<StartSessionResponse> {
    const callId = uuidv4();
    const roomName = `voice-${callId}`;
    const participantIdentity = `user-${uuidv4()}`;
    const agentIdentity = `agent-${callId}`;

    this.logger.log(
      `Starting session: room=${roomName} participant=${participantIdentity}`,
    );

    // Room creation + user token (also ensures the room exists).
    const token = await this.livekitService.generateToken(
      roomName,
      participantIdentity,
      { role: 'user', callId },
    );

    // Fire-and-forget the agent bring-up. It internally waits for the browser
    // to subscribe before greeting, so we must NOT await it here.
    void this.voiceAgentService
      .startSession(roomName, callId, agentConfig, metadata)
      .catch((error: Error) => {
        this.logger.error(
          `Agent bring-up failed for room "${roomName}": ${error.message}`,
        );
      });

    return {
      serverUrl: this.livekitService.getLiveKitUrl(),
      token,
      roomName,
      callId,
      participantIdentity,
      agentIdentity,
    };
  }

  /** End a session and tear down the server-side agent. */
  async stopSession(roomName: string): Promise<void> {
    await this.voiceAgentService.stopSession(roomName, 'participant');
  }
}
