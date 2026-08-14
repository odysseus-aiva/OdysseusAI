'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveKitRoom } from '@livekit/components-react';
import { AnimatePresence, motion } from 'motion/react';
import { fetchAgents, type Agent } from '@/lib/api/agents';
import { voiceRoomOptions } from '@/lib/livekit/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { resolveHero } from '../hero-content';
import type { VoiceState } from '../types';
import { ParticleOrb } from './ParticleOrb';
import { ScrambleText } from './ScrambleText';
import { StatusIndicator, type StatusDetail } from './StatusIndicator';
import { VoiceConsole } from './VoiceConsole';
import { VoiceRoom } from './VoiceRoom';

const ENTER = { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const };

export function VoiceExperience() {
  const searchParams = useSearchParams();
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: ENTER.ease }}
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
            className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: ENTER.ease }}
          >
            {/* ── Hero ── */}
            <div className="mb-8 flex flex-col items-center gap-4 text-center">
              {/* Eyebrow — a caption, not a status: the dot and the state label
                  live in the StatusIndicator under the orb. */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 10 }}
                transition={{ ...ENTER, delay: 0.08 }}
              >
                <ScrambleText
                  key={hero.eyebrow}
                  text={hero.eyebrow}
                  delay={mounted ? 0 : 280}
                  duration={620}
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--fg-muted)',
                  }}
                />
              </motion.div>

              {/* Headline — word-by-word slide-up, re-keyed so it re-animates
                  when the context (and therefore the copy) changes. The display
                  face is licensed for this one line and nothing else. */}
              <h1
                className="flex flex-wrap items-baseline justify-center gap-x-[0.2em]"
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-display-xl)',
                  fontWeight: 'var(--weight-light)',
                  letterSpacing: 'var(--tracking-display)',
                  lineHeight: 'var(--leading-display)',
                  color: 'var(--fg-ink)',
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
                      transition={{ ...ENTER, delay: 0.12 + i * 0.05 }}
                    >
                      {word}
                    </motion.span>
                  </span>
                ))}
              </h1>

              {/* Subline — swaps with the context, cross-faded */}
              <div className="flex min-h-12 items-start justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={hero.subline}
                    style={{
                      margin: 0,
                      maxWidth: 'var(--measure-prose)',
                      fontSize: 'var(--text-body)',
                      lineHeight: 'var(--leading-body)',
                      color:
                        phase === 'error' ? 'var(--status-error)' : 'var(--fg-body)',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: mounted ? 1 : 0, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ ...ENTER, delay: mounted ? 0 : 0.44, duration: 0.22 }}
                  >
                    {hero.subline}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* ── Orb — state-aware WebGL particle sphere ── */}
            <motion.div
              className="flex w-full max-w-[320px] justify-center"
              initial={{ opacity: 0, scale: 0.86 }}
              animate={{ opacity: mounted ? 1 : 0, scale: 1 }}
              transition={{ duration: 0.38, delay: 0.16, ease: ENTER.ease }}
            >
              <ParticleOrb size={320} state={landingState} />
            </motion.div>

            {/* ── Status + console — one vertical stack under the orb ── */}
            <div className="mt-8 flex flex-col items-center gap-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 10 }}
                transition={{ ...ENTER, delay: 0.28 }}
              >
                <StatusIndicator state={landingState} details={statusDetails} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 14 }}
                transition={{ ...ENTER, delay: 0.34 }}
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
