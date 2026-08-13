'use client';

import { useEffect, useRef, useState } from 'react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

/** Per-frame audio energy: overall loudness plus coarse spectral bands (0..1). */
export interface AudioFrame {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

const SILENT_FRAME: AudioFrame = { level: 0, bass: 0, mid: 0, treble: 0 };

/**
 * Real-time loudness + spectral bands for a LiveKit audio track, sampled via the
 * Web Audio API. Drives the audio-reactive orb from real signal rather than a
 * decorative loop.
 *
 * - `level` — React state, throttled to ~20fps (cheap re-renders, e.g. meters).
 * - `dataRef` — updated every animation frame with { level, bass, mid, treble };
 *   the orb reads this imperatively so motion follows the voice per frame.
 *
 * A separate MediaStream is tapped off the track's MediaStreamTrack, so this
 * only *reads* the signal — it never plays audio and does not touch LiveKit's
 * own RoomAudioRenderer playback path.
 */
export function useAudioLevel(
  track: LocalAudioTrack | RemoteAudioTrack | undefined,
  enabled = true,
): {
  level: number;
  levelRef: React.RefObject<number>;
  dataRef: React.RefObject<AudioFrame>;
} {
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const dataRef = useRef<AudioFrame>({ ...SILENT_FRAME });

  useEffect(() => {
    if (!track || !enabled) {
      levelRef.current = 0;
      dataRef.current = { ...SILENT_FRAME };
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

    const timeBuffer = new Uint8Array(analyser.fftSize);
    const freqBuffer = new Uint8Array(analyser.frequencyBinCount);

    // Frequency-bin boundaries per band. With fftSize 512 there are 256 bins;
    // at ~48 kHz each bin ≈ 94 Hz, so these cover roughly:
    //   bass ≈ 90–560 Hz · mid ≈ 560–3 kHz · treble ≈ 3–9 kHz.
    const BANDS = [
      { from: 1, to: 6, gain: 1.15 },
      { from: 6, to: 32, gain: 1.35 },
      { from: 32, to: 96, gain: 1.9 },
    ] as const;

    const bandEnergy = (from: number, to: number, gain: number): number => {
      let sum = 0;
      const hi = Math.min(to, freqBuffer.length);
      for (let i = from; i < hi; i++) sum += freqBuffer[i];
      const avg = sum / Math.max(1, hi - from) / 255;
      return Math.min(avg * gain, 1);
    };

    let raf = 0;
    let lastPublish = 0;
    let disposed = false;

    const sample = () => {
      if (disposed) return;
      raf = requestAnimationFrame(sample);

      analyser.getByteTimeDomainData(timeBuffer);
      analyser.getByteFrequencyData(freqBuffer);

      // RMS of the centered waveform → overall loudness.
      let sumSquares = 0;
      for (let i = 0; i < timeBuffer.length; i++) {
        const v = (timeBuffer[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / timeBuffer.length);

      // Speech RMS rarely exceeds ~0.3; scale so normal speech spans the range.
      const normalized = Math.min(rms * 3.2, 1);
      levelRef.current = normalized;
      dataRef.current = {
        level: normalized,
        bass: bandEnergy(BANDS[0].from, BANDS[0].to, BANDS[0].gain),
        mid: bandEnergy(BANDS[1].from, BANDS[1].to, BANDS[1].gain),
        treble: bandEnergy(BANDS[2].from, BANDS[2].to, BANDS[2].gain),
      };

      // Throttle React updates to ~20fps — the orb reads dataRef per frame.
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
      dataRef.current = { ...SILENT_FRAME };
    };
  }, [track, enabled]);

  return { level, levelRef, dataRef };
}
