import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordingService } from '../recording/recording.service';
import {
  AudioFrame,
  AudioResampler,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  LocalTrackPublication,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

const AGENT_AUDIO_SAMPLE_RATE = 24000;
const STT_AUDIO_SAMPLE_RATE = 16000;
/** 20ms frames so barge-in can abort mid-utterance with low latency */
const PUBLISH_FRAME_SECONDS = 0.02;
const AUDIO_QUEUE_SIZE_MS = 30_000;

export type AudioChunkHandler = (
  pcm: Buffer,
  participantId: string,
) => void;

export type PublishPcmResult = 'completed' | 'interrupted';

interface AgentRoomConnection {
  room: Room;
  audioSource: AudioSource;
  localTrack: LocalAudioTrack;
  trackPublication: LocalTrackPublication;
  abortController: AbortController;
  /** Aborts the active outbound PCM publish (barge-in). */
  playbackAbort: AbortController | null;
  activeTrackReaders: Set<string>;
  publishChain: Promise<void>;
  /** Rolling stats for the Omni streaming-append path (enqueuePcm). */
  streamStats?: {
    frames: number;
    samples: number;
    peak: number;
    lastLogAt: number;
    firstFrameLogged: boolean;
  };
}

@Injectable()
export class LivekitRtcService {
  private readonly logger = new Logger(LivekitRtcService.name);
  private readonly connections = new Map<string, AgentRoomConnection>();
  /** In-flight word-by-word agent caption reveals, keyed by room. */
  private readonly assistantCaptionAbort = new Map<string, AbortController>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly recordingService?: RecordingService,
  ) {}

  isConnected(roomName: string): boolean {
    return this.connections.get(roomName)?.room.isConnected ?? false;
  }

  /**
   * Publish the agent's live state as participant attributes so frontends can
   * react in real time via LiveKit signaling (e.g. `useVoiceAssistant`).
   *
   * `lk.agent.state` mirrors the LiveKit Agents-framework convention
   * (`initializing` | `listening` | `thinking` | `speaking`), keeping the
   * client idiomatic even though this agent is driven by rtc-node directly.
   */
  async setAgentState(roomName: string, state: string): Promise<void> {
    const connection = this.connections.get(roomName);
    const localParticipant = connection?.room.localParticipant;
    if (!localParticipant) return;

    try {
      await localParticipant.setAttributes({ 'lk.agent.state': state });
    } catch (error) {
      this.logger.warn(
        `Failed to publish agent state "${state}" for room "${roomName}": ${(error as Error).message}`,
      );
    }
  }

  /**
   * Push a live caption to browsers in the room over the LiveKit data channel.
   */
  async publishLiveTranscript(
    roomName: string,
    payload: {
      role: 'user' | 'assistant';
      text: string;
      isFinal: boolean;
    },
  ): Promise<void> {
    const connection = this.connections.get(roomName);
    const localParticipant = connection?.room.localParticipant;
    const text = payload.text?.trim();
    if (!localParticipant || !text) return;

    const packet = {
      v: 1 as const,
      role: payload.role,
      text: text.slice(0, 4000),
      isFinal: payload.isFinal,
      ts: Date.now(),
    };

    try {
      await localParticipant.publishData(
        Buffer.from(JSON.stringify(packet), 'utf8'),
        {
          // Always reliable — lossy drops interim captions under load, which
          // made the UI feel like it only updated on finals.
          reliable: true,
          topic: 'odysseus.transcript',
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish live transcript for room "${roomName}": ${(error as Error).message}`,
      );
    }
  }

  /**
   * Publish a non-transcript live event (a tool execution or a session-state
   * hint like `interrupted`) on the same data channel the transcript uses.
   * Browsers branch on `kind`; transcript packets carry no `kind`.
   */
  async publishLiveEvent(
    roomName: string,
    packet: Record<string, unknown>,
  ): Promise<void> {
    const connection = this.connections.get(roomName);
    const localParticipant = connection?.room.localParticipant;
    if (!localParticipant) return;

    try {
      await localParticipant.publishData(
        Buffer.from(JSON.stringify({ v: 1, ts: Date.now(), ...packet }), 'utf8'),
        { reliable: true, topic: 'odysseus.transcript' },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish live event for room "${roomName}": ${(error as Error).message}`,
      );
    }
  }

  /**
   * Omni often delivers the agent's full reply in one shot. Reveal it
   * word-by-word so the Agent line types while audio is playing.
   * Always commits the full text at the end — even if barge-in / replace
   * aborts the reveal mid-way (unless a newer stream took over).
   */
  async streamAssistantCaption(
    roomName: string,
    fullText: string,
  ): Promise<void> {
    const text = fullText.trim();
    if (!text) return;

    this.assistantCaptionAbort.get(roomName)?.abort();
    const ac = new AbortController();
    this.assistantCaptionAbort.set(roomName, ac);

    const words = text.split(/\s+/).filter(Boolean);
    let built = '';

    try {
      for (let i = 0; i < words.length; i += 1) {
        if (ac.signal.aborted) break;
        built = built ? `${built} ${words[i]}` : words[i]!;
        // Keep every progressive update interim — the finally-block owns the final.
        await this.publishLiveTranscript(roomName, {
          role: 'assistant',
          text: built,
          isFinal: false,
        });
        if (i >= words.length - 1) break;
        const word = words[i]!;
        const delayMs = Math.min(140, Math.max(45, 30 + word.length * 20));
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, delayMs);
          ac.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
    } finally {
      // If a newer stream replaced us, leave the commit to that stream.
      if (this.assistantCaptionAbort.get(roomName) === ac) {
        await this.publishLiveTranscript(roomName, {
          role: 'assistant',
          text,
          isFinal: true,
        });
        this.assistantCaptionAbort.delete(roomName);
      } else if (!this.assistantCaptionAbort.has(roomName)) {
        // Cancelled with no replacement (barge-in) — still land the text.
        await this.publishLiveTranscript(roomName, {
          role: 'assistant',
          text,
          isFinal: true,
        });
      }
    }
  }

  /** Stop an in-flight agent caption reveal (barge-in). */
  cancelAssistantCaption(roomName: string): void {
    const ac = this.assistantCaptionAbort.get(roomName);
    this.assistantCaptionAbort.delete(roomName);
    ac?.abort();
  }

  async connectAgent(
    roomName: string,
    agentIdentity: string,
    onAudioChunk: AudioChunkHandler,
    onListenerReady?: () => void,
    onParticipantDisconnected?: (participantId: string) => void,
  ): Promise<void> {
    if (this.connections.has(roomName)) {
      this.logger.warn(`Agent already connected to room: ${roomName}`);
      return;
    }

    const url = this.configService.get<string>('livekit.url');
    const apiKey = this.configService.get<string>('livekit.apiKey');
    const apiSecret = this.configService.get<string>('livekit.apiSecret');

    if (!url || !apiKey || !apiSecret) {
      throw new Error('LiveKit credentials not configured');
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: agentIdentity,
      name: 'Voice Agent',
      metadata: JSON.stringify({ role: 'agent' }),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    const room = new Room();
    const abortController = new AbortController();

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      void this.handleTrackSubscribed(
        roomName,
        track,
        participant,
        onAudioChunk,
        abortController.signal,
      );
    });

    room.on(RoomEvent.LocalTrackSubscribed, () => {
      this.logger.log(
        `A participant subscribed to agent audio in room "${roomName}"`,
      );
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.logger.log(
        `Participant left room "${roomName}": ${participant.identity}`,
      );
      if (onParticipantDisconnected && !participant.identity.startsWith('agent-')) {
        onParticipantDisconnected(participant.identity);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      this.logger.log(`Agent disconnected from room: ${roomName}`);
    });

    await room.connect(url, token, { autoSubscribe: true, dynacast: true });
    this.logger.log(
      `Agent "${agentIdentity}" connected to room "${roomName}"`,
    );

    const audioSource = new AudioSource(
      AGENT_AUDIO_SAMPLE_RATE,
      1,
      AUDIO_QUEUE_SIZE_MS,
    );
    const localTrack = LocalAudioTrack.createAudioTrack(
      'agent-voice',
      audioSource,
    );
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;

    const trackPublication = await room.localParticipant!.publishTrack(
      localTrack,
      publishOptions,
    );
    this.logger.log(`Agent audio track published in room "${roomName}"`);

    const connection: AgentRoomConnection = {
      room,
      audioSource,
      localTrack,
      trackPublication,
      abortController,
      playbackAbort: null,
      activeTrackReaders: new Set(),
      publishChain: Promise.resolve(),
    };
    this.connections.set(roomName, connection);

    // Do NOT block here — wait for a subscriber in the background, then
    // notify the caller so it can send the greeting once audio can be heard.
    // For browser sessions the subscriber joins after receiving the token;
    // for SIP inbound sessions the LiveKit SIP bridge subscribes automatically.
    void trackPublication
      .waitForSubscription()
      .then(() => {
        if (abortController.signal.aborted) return;
        this.logger.log(`Listener ready for agent audio in room "${roomName}"`);
        onListenerReady?.();
      })
      .catch((error: Error) => {
        this.logger.warn(
          `waitForSubscription failed for room "${roomName}": ${error.message}`,
        );
      });

    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track) {
          void this.handleTrackSubscribed(
            roomName,
            publication.track,
            participant,
            onAudioChunk,
            abortController.signal,
          );
        }
      }
    }
  }

  async waitForListener(roomName: string): Promise<boolean> {
    const connection = this.connections.get(roomName);
    return connection?.room.isConnected ?? false;
  }

  /**
   * Immediately stop outbound agent audio (barge-in).
   * Clears the LiveKit audio queue and aborts the active publish loop.
   */
  stopPlayback(roomName: string): void {
    const connection = this.connections.get(roomName);
    if (!connection) return;

    if (connection.playbackAbort && !connection.playbackAbort.signal.aborted) {
      connection.playbackAbort.abort();
    }

    try {
      connection.audioSource.clearQueue();
    } catch (error) {
      this.logger.warn(
        `clearQueue failed for room "${roomName}": ${(error as Error).message}`,
      );
    }

    this.logger.log(`Playback stopped (barge-in) in room "${roomName}"`);
  }

  async publishPcm(
    roomName: string,
    audio: Buffer,
    sampleRate: number,
  ): Promise<PublishPcmResult> {
    const connection = this.connections.get(roomName);
    if (!connection) {
      this.logger.warn(`No RTC connection for room: ${roomName}`);
      return 'completed';
    }

    let result: PublishPcmResult = 'completed';

    const publishTask = async () => {
      // Supersede any previous utterance still publishing.
      if (connection.playbackAbort && !connection.playbackAbort.signal.aborted) {
        connection.playbackAbort.abort();
        try {
          connection.audioSource.clearQueue();
        } catch {
          /* ignore */
        }
      }

      const playbackAbort = new AbortController();
      connection.playbackAbort = playbackAbort;
      const signal = playbackAbort.signal;

      const pcm = this.toInt16Pcm(audio, sampleRate);
      const peak = pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
      const durationSec = pcm.length / AGENT_AUDIO_SAMPLE_RATE;

      this.logger.log(
        `Streaming ${pcm.length} samples (${durationSec.toFixed(1)}s, peak=${peak}) to room "${roomName}"`,
      );

      if (peak < 100) {
        this.logger.warn(
          `Audio peak very low (${peak}) — TTS output may be silent or corrupt`,
        );
      }

      connection.audioSource.clearQueue();

      const samplesPerFrame = Math.max(
        1,
        Math.floor(AGENT_AUDIO_SAMPLE_RATE * PUBLISH_FRAME_SECONDS),
      );
      let offset = 0;

      while (offset < pcm.length) {
        if (signal.aborted) {
          result = 'interrupted';
          this.logger.log(
            `Audio publish interrupted mid-stream in room "${roomName}"`,
          );
          break;
        }

        const frameSampleCount = Math.min(samplesPerFrame, pcm.length - offset);
        const frameData = pcm.subarray(offset, offset + frameSampleCount);
        const frameCopy = new Int16Array(frameData);

        const frame = new AudioFrame(
          frameCopy,
          AGENT_AUDIO_SAMPLE_RATE,
          1,
          frameCopy.length,
        );
        await connection.audioSource.captureFrame(frame);
        if (this.recordingService) {
          this.recordingService.appendAgentAudio(
            roomName,
            Buffer.from(frameCopy.buffer, frameCopy.byteOffset, frameCopy.byteLength),
          );
        }
        offset += frameSampleCount;
      }

      if (!signal.aborted) {
        await connection.audioSource.waitForPlayout();
        this.logger.log(`Finished audio playback in room "${roomName}"`);
        result = 'completed';
      } else {
        try {
          connection.audioSource.clearQueue();
        } catch {
          /* ignore */
        }
        result = 'interrupted';
      }

      if (connection.playbackAbort === playbackAbort) {
        connection.playbackAbort = null;
      }
    };

    connection.publishChain = connection.publishChain
      .then(publishTask)
      .catch((error: Error) => {
        if (error.name === 'AbortError' || connection.playbackAbort?.signal.aborted) {
          result = 'interrupted';
          return;
        }
        this.logger.error(
          `Audio publish failed for room "${roomName}": ${error.message}`,
        );
      });

    await connection.publishChain;
    return result;
  }

  /**
   * Append PCM to the agent track as a continuous stream. Unlike publishPcm,
   * this does NOT abort prior audio, clear the queue, or wait for playout — it
   * just enqueues frames into the AudioSource buffer. Use for realtime engines
   * (Omni) that emit many small frames back-to-back; publishPcm would shred
   * them by superseding each with the next.
   */
  async enqueuePcm(
    roomName: string,
    audio: Buffer,
    sampleRate: number,
  ): Promise<void> {
    const connection = this.connections.get(roomName);
    if (!connection) return;

    const pcm = this.toInt16Pcm(audio, sampleRate);
    if (pcm.length === 0) return;

    // Per-connection streaming stats, logged periodically so tiny frames don't
    // flood the log while still proving audio is flowing.
    const stats = connection.streamStats ?? { frames: 0, samples: 0, peak: 0, lastLogAt: 0, firstFrameLogged: false };
    let peak = 0;
    for (const sample of pcm) {
      const a = Math.abs(sample);
      if (a > peak) peak = a;
    }
    stats.frames += 1;
    stats.samples += pcm.length;
    stats.peak = Math.max(stats.peak, peak);
    connection.streamStats = stats;

    const now = Date.now();
    if (now - stats.lastLogAt > 1000) {
      this.logger.log(
        `[omni-audio] room="${roomName}" streamed ${stats.frames} frames / ` +
          `${stats.samples} samples (${(stats.samples / AGENT_AUDIO_SAMPLE_RATE).toFixed(1)}s) ` +
          `peak=${stats.peak}`,
      );
      if (stats.peak < 100) {
        this.logger.warn(
          `[omni-audio] room="${roomName}" audio peak still low (${stats.peak}) after ${stats.frames} frames — check output tag/encoding`,
        );
      }
      stats.lastLogAt = now;
      stats.peak = 0;
    }

    const frame = new AudioFrame(
      new Int16Array(pcm),
      AGENT_AUDIO_SAMPLE_RATE,
      1,
      pcm.length,
    );
    try {
      if (!stats.firstFrameLogged) {
        stats.firstFrameLogged = true;
        this.logger.log(
          `[omni-audio] room="${roomName}" first captureFrame: ${pcm.length} samples peak=${stats.peak}`,
        );
      }
      await connection.audioSource.captureFrame(frame);
      if (this.recordingService) {
        this.recordingService.appendAgentAudio(
          roomName,
          Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
        );
      }
    } catch (error) {
      this.logger.warn(
        `[omni-audio] captureFrame failed for room "${roomName}": ${(error as Error).message}`,
      );
    }
  }

  async disconnect(roomName: string): Promise<void> {
    const connection = this.connections.get(roomName);
    if (!connection) return;

    this.cancelAssistantCaption(roomName);
    this.stopPlayback(roomName);
    connection.abortController.abort();
    connection.activeTrackReaders.clear();

    try {
      await connection.publishChain;
      await connection.localTrack.close();
      await connection.room.disconnect();
    } catch (error) {
      this.logger.warn(
        `Error disconnecting from room "${roomName}": ${(error as Error).message}`,
      );
    }

    this.connections.delete(roomName);
    this.logger.log(`Agent RTC disconnected from room: ${roomName}`);
  }

  private toInt16Pcm(audio: Buffer, sampleRate: number): Int16Array {
    const count = Math.floor(audio.byteLength / 2);
    const input = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      input[i] = audio.readInt16LE(i * 2);
    }

    if (sampleRate === AGENT_AUDIO_SAMPLE_RATE) {
      return input;
    }

    const resampler = new AudioResampler(
      sampleRate,
      AGENT_AUDIO_SAMPLE_RATE,
      1,
    );
    const inputFrame = new AudioFrame(
      input,
      sampleRate,
      1,
      input.length,
    );
    const outputFrames = resampler.push(inputFrame);
    const flushed = resampler.flush();
    const allFrames = [...outputFrames, ...flushed];

    const totalSamples = allFrames.reduce(
      (sum, frame) => sum + frame.samplesPerChannel,
      0,
    );
    const merged = new Int16Array(totalSamples);
    let offset = 0;
    for (const frame of allFrames) {
      merged.set(frame.data, offset);
      offset += frame.samplesPerChannel;
    }
    return merged;
  }

  private async handleTrackSubscribed(
    roomName: string,
    track: RemoteTrack,
    participant: RemoteParticipant,
    onAudioChunk: AudioChunkHandler,
    signal: AbortSignal,
  ): Promise<void> {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    if (participant.identity.startsWith('agent-')) return;

    const connection = this.connections.get(roomName);
    if (!connection) return;

    const readerKey = `${participant.identity}:${track.sid}`;
    if (connection.activeTrackReaders.has(readerKey)) return;
    connection.activeTrackReaders.add(readerKey);

    this.logger.log(
      `Subscribed to audio from "${participant.identity}" in room "${roomName}"`,
    );

    try {
      const stream = new AudioStream(track as RemoteAudioTrack, {
        sampleRate: STT_AUDIO_SAMPLE_RATE,
        numChannels: 1,
      });
      const reader = stream.getReader();

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        const chunk = Buffer.from(
          value.data.buffer,
          value.data.byteOffset,
          value.data.byteLength,
        );
        onAudioChunk(chunk, participant.identity);
        this.recordingService?.appendUserAudio(roomName, chunk);
      }

      reader.releaseLock();
    } catch (error) {
      if (!signal.aborted) {
        this.logger.error(
          `Audio reader error for "${participant.identity}": ${(error as Error).message}`,
        );
      }
    } finally {
      connection.activeTrackReaders.delete(readerKey);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
