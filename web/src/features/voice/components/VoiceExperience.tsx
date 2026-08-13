'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveKitRoom } from '@livekit/components-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from '@/components/ThemeProvider';
import { fetchAgents, type Agent } from '@/lib/api/agents';
import { voiceRoomOptions } from '@/lib/livekit/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { resolveHero } from '../hero-content';
import { resolveOrbState } from '../orb-states';
import type { VoiceState } from '../types';
import { ParticleOrb } from './ParticleOrb';
import { ScrambleText } from './ScrambleText';
import { StatusIndicator, type StatusDetail } from './StatusIndicator';
import { VoiceConsole } from './VoiceConsole';
import { VoiceRoom } from './VoiceRoom';

const ENTER = { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const };

export function VoiceExperience() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const { phase, connection, error, start, stop, signalAgentError } = useVoiceSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(
    () => searchParams.get('agentId') ?? '',
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Small timeout so the entry animation fires after shell paint
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    void fetchAgents()
      .then((list) => {
        setAgents(list);
        const fromQuery = searchParams.get('agentId');
        if (fromQuery && list.some((a) => a.agentId === fromQuery)) {
          setSelectedAgentId(fromQuery);
        }
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoaded(true));
  }, [searchParams]);

  // True when the user explicitly triggered the disconnect (button or reconnect).
  // When LiveKit fires onDisconnected without this being set, the disconnect
  // came from the agent/backend side and should surface as an error.
  const userInitiatedDisconnect = useRef(false);

  const handleTalk = useCallback(() => {
    userInitiatedDisconnect.current = false;
    void start(selectedAgentId ? { agentConfig: { agentId: selectedAgentId } } : undefined);
  }, [start, selectedAgentId]);

  const handleDisconnect = useCallback(() => {
    userInitiatedDisconnect.current = true;
    stop();
  }, [stop]);

  const handleReconnect = useCallback(() => {
    userInitiatedDisconnect.current = true;
    stop();
    void start(selectedAgentId ? { agentConfig: { agentId: selectedAgentId } } : undefined);
  }, [stop, start, selectedAgentId]);

  const handleRoomDisconnected = useCallback(() => {
    if (userInitiatedDisconnect.current) {
      stop();
    } else {
      signalAgentError();
    }
    userInitiatedDisconnect.current = false;
  }, [stop, signalAgentError]);

  const isConnected = phase === 'connected' && connection !== null;
  const selectedAgent = useMemo(
    () => agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  // Pre-room voice state: the landing orb reflects the connection lifecycle.
  const landingState: VoiceState =
    phase === 'error' ? 'error' : phase === 'requesting' ? 'connecting' : 'idle';

  const hero = useMemo(
    () =>
      resolveHero({
        phase,
        voiceState: landingState,
        agent: selectedAgent,
        agentCount: agents.length,
        error,
      }),
    [phase, landingState, selectedAgent, agents.length, error],
  );

  const statusDetails: StatusDetail[] = useMemo(() => {
    if (!hero.providers.length) return [];
    return hero.providers.map((p) => ({ label: p.label, value: p.value }));
  }, [hero.providers]);

  const ambientColor = resolveOrbState(landingState, theme).colorBase;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Ambient scene — a breathing gradient field, separate from the orb.
          Its hue follows the active state so the whole page shifts together. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
      >
        {/* Permanent orb spotlight — always-on, gives field something to contrast */}
        <div
          className="absolute"
          style={{
            width: 600,
            height: 600,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -52%)',
            background: `radial-gradient(circle, ${ambientColor}0e 0%, transparent 55%)`,
            filter: 'blur(1px)',
            transition: 'background 900ms var(--ease-fluid)',
          }}
        />

        {/* Breathing primary bloom — amplifies orb rhythm */}
        <motion.div
          className="absolute"
          style={{
            width: 800,
            height: 800,
            top: '50%',
            left: '50%',
            x: '-50%',
            y: '-52%',
            background: `radial-gradient(circle, ${ambientColor}0a 0%, transparent 52%)`,
            transition: 'background 900ms var(--ease-fluid)',
          }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Secondary bloom — violet floor warmth */}
        <motion.div
          className="absolute"
          style={{
            width: 560,
            height: 560,
            bottom: '-8%',
            right: '-6%',
            background: 'radial-gradient(circle, rgb(139 92 246 / 0.055) 0%, transparent 58%)',
          }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        {/* Horizon gradient — barely visible, implies depth floor */}
        <div
          className="absolute w-full"
          style={{
            height: 80,
            bottom: '20%',
            background: 'linear-gradient(0deg, rgb(56 232 255 / 0.018) 0%, transparent 100%)',
          }}
        />
      </motion.div>

      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <LiveKitRoom
              serverUrl={connection.serverUrl}
              token={connection.token}
              connect audio video={false}
              options={voiceRoomOptions}
              onDisconnected={handleRoomDisconnected}
            >
              <VoiceRoom
                agent={selectedAgent}
                callId={connection.callId}
                onDisconnect={handleDisconnect}
                onReconnect={handleReconnect}
              />
            </LiveKitRoom>
          </motion.div>
        ) : (
          <motion.div
            key="landing"
            className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ── Hero ── */}
            <div className="flex flex-col items-center gap-4 mb-12 text-center">
              {/* Eyebrow — live status dot + decoding state label */}
              <motion.div
                className="flex items-center gap-2.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 10 }}
                transition={{ ...ENTER, delay: 0.08 }}
              >
                <motion.span
                  className="h-[6px] w-[6px] rounded-full"
                  style={{
                    background: ambientColor,
                    boxShadow: `0 0 8px ${ambientColor}`,
                    transition: 'background 500ms var(--ease-fluid)',
                  }}
                  animate={{ opacity: [1, 0.35, 1], scale: [1, 0.82, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <ScrambleText
                  key={hero.eyebrow}
                  text={hero.eyebrow.toUpperCase()}
                  delay={mounted ? 0 : 280}
                  duration={620}
                  className="text-[10.5px] font-[600] uppercase tracking-[0.3em]"
                  style={{ color: ambientColor, transition: 'color 500ms var(--ease-fluid)' }}
                />
              </motion.div>

              {/* Headline — word-by-word slide-up, re-keyed so it re-animates
                  when the context (and therefore the copy) changes */}
              <h1
                className="flex flex-wrap items-baseline justify-center gap-x-[0.24em] font-[600] leading-[1.04] tracking-[-0.045em]"
                style={{
                  color: 'var(--color-text)',
                  fontSize: 'clamp(28px, 5vw, 44px)',
                }}
              >
                {hero.headline.map((word, i) => (
                  <span
                    key={`${hero.eyebrow}-${word}-${i}`}
                    className="inline-flex overflow-hidden pb-[0.12em] -mb-[0.12em]"
                  >
                    <motion.span
                      className="inline-block"
                      initial={{ y: '115%' }}
                      animate={{ y: mounted ? '0%' : '115%' }}
                      transition={{ ...ENTER, delay: 0.16 + i * 0.07 }}
                    >
                      {word}
                    </motion.span>
                  </span>
                ))}
              </h1>

              {/* Subline — swaps with the context, cross-faded */}
              <div className="flex min-h-[42px] items-start justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={hero.subline}
                    className="max-w-[42ch] text-[13.5px] font-[400] leading-[1.6]"
                    style={{
                      color: phase === 'error'
                        ? 'var(--color-state-error)'
                        : 'var(--color-text-muted)',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: mounted ? 1 : 0, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ ...ENTER, delay: mounted ? 0 : 0.44, duration: 0.44 }}
                  >
                    {hero.subline}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* ── Orb — state-aware WebGL particle sphere ── */}
            <motion.div
              className="flex w-full max-w-[320px] justify-center"
              initial={{ opacity: 0, scale: 0.82, filter: 'blur(18px)' }}
              animate={{ opacity: mounted ? 1 : 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1.05, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <ParticleOrb size={320} state={landingState} />
            </motion.div>

            {/* ── Status + console — one vertical stack under the orb ── */}
            <div className="mt-11 flex flex-col items-center gap-7">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 10 }}
                transition={{ ...ENTER, delay: 0.4 }}
              >
                <StatusIndicator state={landingState} details={statusDetails} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 14 }}
                transition={{ ...ENTER, delay: 0.48 }}
              >
                {agentsLoaded && (
                  <VoiceConsole
                    agents={agents}
                    selectedAgentId={selectedAgentId}
                    onSelectAgent={setSelectedAgentId}
                    onTalk={handleTalk}
                    loading={phase === 'requesting'}
                    actionLabel={phase === 'error' ? 'Try again' : 'Start talking'}
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
