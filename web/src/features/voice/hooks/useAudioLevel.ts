'use client';

import { useEffect, useRef, useState } from 'react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

/**
 * Normalized 0..1 loudness for a LiveKit audio track, sampled via the Web Audio
 * API. Used to drive audio-reactive orb states (listening ripples, speaking
 * pulse) from real signal rather than a decorative loop.
 *
 * Returns a state value throttled to ~20fps so React re-renders stay cheap; the
 * orb reads the same value imperatively for per-frame smoothness.
 */
export function useAudioLevel(
  track: LocalAudioTrack | RemoteAudioTrack | undefined,
  enabled = true,
): { level: number; levelRef: React.RefObject<number> } {
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);

  useEffect(() => {
    if (!track || !enabled) {
      levelRef.current = 0;
      setLevel(0);
      return;
    }

    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) return;

    type WindowWithAudioContext = Window & {
      AudioContext: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const w = window as unknown as WindowWithAudioContext;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }

    const stream = new MediaStream([mediaStreamTrack]);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let lastPublish = 0;
    let disposed = false;

    const sample = () => {
      if (disposed) return;
      raf = requestAnimationFrame(sample);

      analyser.getByteTimeDomainData(buffer);

      // RMS of the centered waveform.
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      // Speech RMS rarely exceeds ~0.3; scale so normal speech spans the range.
      const normalized = Math.min(rms * 3.2, 1);
      levelRef.current = normalized;

      // Throttle React updates to ~20fps — the orb reads levelRef per frame.
      const now = performance.now();
      if (now - lastPublish > 50) {
        lastPublish = now;
        setLevel(normalized);
      }
    };

    // Browsers may hand back a suspended context outside a gesture.
    void ctx.resume().catch(() => undefined);
    sample();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser.disconnect();
      void ctx.close().catch(() => undefined);
      levelRef.current = 0;
    };
  }, [track, enabled]);

  return { level, levelRef };
}
