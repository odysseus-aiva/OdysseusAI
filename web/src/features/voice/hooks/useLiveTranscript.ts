'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

const TOPIC = 'odysseus.transcript';
const MERGE_GAP_MS = 6000;
const MAX_TEXT = 4000;

export interface LiveLine {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  /** False while STT is still revising this utterance. */
  isFinal: boolean;
}

interface LiveTranscriptPacket {
  v: 1;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  ts: number;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeText(a: string, b: string): string {
  if (b === a || a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  const joined = /^[.,!?;:]/.test(b) ? a + b : `${a} ${b}`;
  return collapseWhitespace(joined);
}

function parsePacket(payload: Uint8Array): LiveTranscriptPacket | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(payload)) as Partial<LiveTranscriptPacket>;
    if (raw.v !== 1) return null;
    if (raw.role !== 'user' && raw.role !== 'assistant') return null;
    if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
    return {
      v: 1,
      role: raw.role,
      text: collapseWhitespace(raw.text).slice(0, MAX_TEXT),
      isFinal: Boolean(raw.isFinal),
      ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Apply a live caption packet — interims rewrite the open line; finals commit. */
export function applyLivePacket(lines: LiveLine[], packet: LiveTranscriptPacket): LiveLine[] {
  const next = [...lines];
  const openIdx = next.findIndex((l) => l.role === packet.role && !l.isFinal);
  const last = next.at(-1);

  if (!packet.isFinal) {
    if (openIdx >= 0) {
      const open = next[openIdx]!;
      next[openIdx] = {
        ...open,
        text: packet.text,
        timestamp: packet.ts,
      };
      // Keep the live line at the bottom so it stays visible while typing.
      if (openIdx !== next.length - 1) {
        const [row] = next.splice(openIdx, 1);
        if (row) next.push(row);
      }
      return next;
    }
    next.push({
      id: `live-${packet.role}-${packet.ts}-${next.length}`,
      role: packet.role,
      text: packet.text,
      timestamp: packet.ts,
      isFinal: false,
    });
    return next;
  }

  // Final — close any open line of this role.
  if (openIdx >= 0) {
    const open = next[openIdx]!;
    next[openIdx] = {
      ...open,
      id: `live-${packet.role}-${packet.ts}-${openIdx}`,
      text: packet.text,
      timestamp: packet.ts,
      isFinal: true,
    };
    if (openIdx !== next.length - 1) {
      const [row] = next.splice(openIdx, 1);
      if (row) next.push(row);
    }
    return next;
  }

  // Only merge into the previous final when this packet is a refinement of it
  // (prefix / duplicate) — never glue two distinct agent replies together.
  if (
    last?.role === packet.role &&
    last.isFinal &&
    packet.ts - last.timestamp <= MERGE_GAP_MS
  ) {
    const a = last.text;
    const b = packet.text;
    if (b === a || b.startsWith(a) || a.startsWith(b) || a.endsWith(b)) {
      next[next.length - 1] = {
        ...last,
        text: mergeText(a, b),
        timestamp: packet.ts,
      };
      return next;
    }
  }

  next.push({
    id: `live-${packet.role}-${packet.ts}-${next.length}`,
    role: packet.role,
    text: packet.text,
    timestamp: packet.ts,
    isFinal: true,
  });
  return next;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Instant Customer captions from the browser mic (Chrome/Edge).
 * Server packets still correct/finalize the same line when they arrive.
 */
function useLocalCustomerCaptions(
  onCaption: (text: string) => void,
  enabled: boolean,
) {
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    rec.onresult = (ev) => {
      let interim = '';
      let finalChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i]?.[0]?.transcript ?? '';
        if (ev.results[i]?.isFinal) finalChunk += piece;
        else interim += piece;
      }
      // Always treat browser output as provisional — server finals own commit.
      const text = collapseWhitespace(finalChunk || interim);
      if (text) onCaptionRef.current(text);
    };

    rec.onerror = (ev) => {
      // `no-speech` / `aborted` are normal; keep the loop alive.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        stopped = true;
      }
    };

    rec.onend = () => {
      if (stopped) return;
      restartTimer = setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, 120);
    };

    try {
      rec.start();
    } catch {
      /* mic / recognition unavailable */
    }

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled]);
}

/**
 * Real-time captions: browser SpeechRecognition for Customer (instant) +
 * LiveKit data channel for Agent + server corrections.
 * Must run inside LiveKitRoom.
 */
export function useLiveTranscript(callId?: string) {
  const room = useRoomContext();
  const [lines, setLines] = useState<LiveLine[]>([]);
  // When server user packets arrive, briefly prefer them over local SR.
  const serverUserUntil = useRef(0);

  const apply = useCallback((packet: LiveTranscriptPacket) => {
    setLines((prev) => applyLivePacket(prev, packet));
  }, []);

  useEffect(() => {
    setLines([]);
    serverUserUntil.current = 0;
  }, [callId]);

  useEffect(() => {
    if (!room) return;

    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic && topic !== TOPIC) return;
      const packet = parsePacket(payload);
      if (!packet) return;
      if (packet.role === 'user') {
        serverUserUntil.current = Date.now() + 1500;
      }
      apply(packet);
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, apply]);

  useLocalCustomerCaptions(
    useCallback(
      (text: string) => {
        // Don't fight a fresh server interim/final for the same utterance.
        if (Date.now() < serverUserUntil.current) return;
        apply({
          v: 1,
          role: 'user',
          text,
          isFinal: false,
          ts: Date.now(),
        });
      },
      [apply],
    ),
    Boolean(room),
  );

  return { lines, ready: true };
}
