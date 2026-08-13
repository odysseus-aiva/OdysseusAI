'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Mic } from 'lucide-react';
import { Select } from '@/components/ui/Field';
import type { Agent } from '@/lib/api/agents';

interface VoiceConsoleProps {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onTalk: () => void;
  loading?: boolean;
  /** Overrides the action label — e.g. "Try again" after an error. */
  actionLabel?: string;
  disabled?: boolean;
}

/**
 * One control surface: agent selection and the talk action share a single
 * capsule, so the interaction reads as a single instrument centered on the orb
 * rather than two detached widgets.
 *
 * The selector collapses out of the layout when only the default agent exists —
 * no empty affordance.
 */
export function VoiceConsole({
  agents,
  selectedAgentId,
  onSelectAgent,
  onTalk,
  loading = false,
  actionLabel = 'Start talking',
  disabled = false,
}: VoiceConsoleProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [selectFocused, setSelectFocused] = useState(false);
  const [actionFocused, setActionFocused] = useState(false);

  const hasAgents = agents.length > 0;
  const isBusy = loading || disabled;
  const activeAgent = agents.find((a) => a.agentId === selectedAgentId);
  const agentLabel = activeAgent?.name ?? 'Default agent';

  // The capsule lifts as a whole on hover/focus so both halves feel connected.
  const surfaceActive = hovered || selectFocused || actionFocused;

  return (
    <div className="relative flex flex-col items-center">
      {/* Breathing ring behind the capsule — the orb's rhythm, echoed */}
      {!isBusy && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -10,
            border: '1px solid var(--color-accent-ring)',
          }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.98, 1.06, 1.12] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      <motion.div
        className="relative flex max-w-full items-stretch overflow-hidden rounded-full"
        style={{
          background: surfaceActive ? 'var(--color-glass-hover)' : 'var(--color-glass)',
          border: `1px solid ${
            surfaceActive ? 'var(--color-accent-border)' : 'var(--color-glass-border)'
          }`,
          backdropFilter: 'blur(20px)',
          boxShadow: surfaceActive
            ? '0 0 28px var(--color-accent-glow), inset 0 1px 0 rgb(255 255 255 / 0.07)'
            : '0 1px 24px rgb(0 0 0 / 0.32), inset 0 1px 0 rgb(255 255 255 / 0.04)',
          transition:
            'background 260ms var(--ease-fluid), border-color 260ms var(--ease-fluid), box-shadow 320ms var(--ease-fluid)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        animate={{ scale: pressed ? 0.985 : 1 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Agent selector half ── */}
        {hasAgents && (
          <div
            className="relative flex min-w-0 items-center"
            onFocusCapture={() => setSelectFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setSelectFocused(false);
            }}
          >
            <Select
              value={selectedAgentId}
              onChange={(e) => onSelectAgent(e.target.value)}
              aria-label="Choose which agent to talk to"
              className="!w-[132px] sm:!w-[168px] !h-[54px] !py-0 !pl-5 !pr-9 !rounded-none leading-[54px] !text-[13px] !font-[500]"
              style={{
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                color: selectFocused ? 'var(--color-text)' : 'var(--color-text-muted)',
                transition: 'color 180ms var(--ease-fluid)',
              }}
            >
              <option value="">Default agent</option>
              {agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name}
                </option>
              ))}
            </Select>

            {/* Hairline seam between the halves */}
            <span
              aria-hidden
              className="absolute right-0 top-1/2 h-[22px] w-px -translate-y-1/2"
              style={{ background: 'var(--color-glass-border)' }}
            />
          </div>
        )}

        {/* ── Action half ── */}
        <button
          type="button"
          onClick={onTalk}
          disabled={isBusy}
          onFocus={() => setActionFocused(true)}
          onBlur={() => setActionFocused(false)}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          aria-label={
            hasAgents ? `${actionLabel} with ${agentLabel}` : actionLabel
          }
          className="group relative flex h-[54px] flex-shrink-0 items-center gap-2.5 whitespace-nowrap pl-5 pr-6 text-[14px] font-[500] tracking-[-0.005em] outline-none disabled:cursor-not-allowed"
          style={{
            color: isBusy ? 'var(--color-text-muted)' : 'var(--color-text)',
            cursor: isBusy ? 'not-allowed' : 'pointer',
            transition: 'color 180ms var(--ease-fluid)',
          }}
        >
          {/* Focus ring — keyboard-only affordance, drawn inside the capsule */}
          {actionFocused && (
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                inset: 4,
                border: '1px solid var(--color-border-focus)',
              }}
            />
          )}

          {/* Sweep highlight on hover */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[420ms] group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(100deg, transparent 20%, rgb(56 232 255 / 0.09) 55%, transparent 85%)',
            }}
          />

          <span className="relative flex items-center gap-2.5">
            {loading ? (
              <motion.span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 13,
                  height: 13,
                  border: '1.5px solid var(--color-accent)',
                  borderTopColor: 'transparent',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <motion.span
                aria-hidden
                className="flex items-center"
                animate={{ opacity: [1, 0.65, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Mic size={14} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
              </motion.span>
            )}
            {loading ? 'Connecting' : actionLabel}
          </span>
        </button>
      </motion.div>
    </div>
  );
}
