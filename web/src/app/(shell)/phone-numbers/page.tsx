'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Phone, Plus, Loader2, AlertCircle, LinkIcon, Unlink, RefreshCw, ShoppingCart, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { fetchAgents, updateAgent, type Agent } from '@/lib/api/agents';
import type { OwnedNumber } from '@/lib/api/twilio';

import { BuyNumberModal } from '@/features/agents/components/BuyNumberModal';

const EMPTY_NUMBER = (phoneNumber: string): OwnedNumber => ({
  sid: '',
  friendlyName: phoneNumber,
  phoneNumber,
  dateCreated: '',
  capabilities: { voice: true, sms: false },
});

interface NumberRow {
  number: OwnedNumber;
  attachedAgent: Agent | null;
}

export default function PhoneNumbersPage() {
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuy, setShowBuy] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  // Track phone numbers bought this session so they show as unattached rows.
  const recentlyBought = useRef(new Set<string>());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agentList = await fetchAgents();
      setAgents(agentList);

      const assignedPhones = new Set(
        agentList.filter((a) => a.phoneNumber).map((a) => a.phoneNumber!),
      );

      // Rows for agents that already have a number assigned
      const agentRows = agentList
        .filter((a) => a.phoneNumber)
        .map((agent) => ({
          number: EMPTY_NUMBER(agent.phoneNumber!),
          attachedAgent: agent,
        }));

      // Numbers bought this session that haven't been assigned yet
      const sessionRows = Array.from(recentlyBought.current)
        .filter((phone) => !assignedPhones.has(phone))
        .map((phone) => ({ number: EMPTY_NUMBER(phone), attachedAgent: null }));

      setRows([...agentRows, ...sessionRows]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load phone numbers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDetach = async (agent: Agent) => {
    setActionTarget(agent.agentId);
    try {
      await updateAgent(agent.agentId, { phoneNumber: null });
      if (agent.phoneNumber) recentlyBought.current.add(agent.phoneNumber);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detach number');
    } finally {
      setActionTarget(null);
    }
  };

  const handleAttach = async (phoneNumber: string, agentId: string) => {
    setActionTarget(agentId);
    try {
      await updateAgent(agentId, { phoneNumber });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach number');
    } finally {
      setActionTarget(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Phone Numbers"
        description="Buy a Twilio number and attach it to an agent so inbound calls are answered automatically."
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowBuy(true)}>
            <ShoppingCart size={13} strokeWidth={2.3} />
            Buy a number
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {/* Refresh */}
          <div className="flex items-center justify-between">
            <span className="text-[12.5px]" style={{ color: 'var(--color-text-faint)' }}>
              {loading ? 'Loading…' : `${rows.length} number${rows.length !== 1 ? 's' : ''}`}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-[500] transition-colors duration-[140ms] disabled:opacity-40"
              style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            >
              <RefreshCw size={11} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {error && (
            <div
              className="flex items-center gap-2.5 rounded-[10px] px-4 py-3 text-[13px]"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#ef4444' }}
            >
              <AlertCircle size={14} strokeWidth={2} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <NumbersSkeleton />
          ) : rows.length === 0 ? (
            <EmptyNumbers onBuy={() => setShowBuy(true)} />
          ) : (
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <motion.div
                  key={row.number.phoneNumber}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.22, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                >
                  <NumberCard
                    row={row}
                    agents={agents}
                    actionTarget={actionTarget}
                    onDetach={handleDetach}
                    onAttach={handleAttach}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {showBuy && (
        <BuyNumberModal
          onClose={() => setShowBuy(false)}
          onPurchased={async (phoneNumber) => {
            recentlyBought.current.add(phoneNumber);
            setShowBuy(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function NumberCard({
  row,
  agents,
  actionTarget,
  onDetach,
  onAttach,
}: {
  row: NumberRow;
  agents: Agent[];
  actionTarget: string | null;
  onDetach: (agent: Agent) => Promise<void>;
  onAttach: (phoneNumber: string, agentId: string) => Promise<void>;
}) {
  const { number, attachedAgent } = row;
  const [attachTo, setAttachTo] = useState('');

  // Only mark busy for this card's in-flight action — never treat actionTarget===null as busy
  const busy =
    (attachedAgent !== null && actionTarget === attachedAgent.agentId) ||
    (attachTo !== '' && actionTarget === attachTo);

  return (
    <div
      className="flex flex-col gap-0 overflow-hidden rounded-[12px]"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
    >
      {/* Top row */}
      <div className="flex items-center gap-4 px-4 py-3.5">
        {/* Phone icon */}
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px]"
          style={{
            background: attachedAgent ? 'var(--color-accent-subtle)' : 'var(--color-surface-elevated)',
            border: `1px solid ${attachedAgent ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
          }}
        >
          <Phone
            size={14}
            strokeWidth={1.8}
            style={{ color: attachedAgent ? 'var(--color-accent)' : 'var(--color-text-faint)' }}
          />
        </div>

        {/* Number + meta */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[14px] font-[600]" style={{ color: 'var(--color-text)' }}>
            {number.phoneNumber}
          </span>
          {number.dateCreated && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              Added {new Date(number.dateCreated).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Agent badge or "unassigned" */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {attachedAgent ? (
            <span
              className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11.5px] font-[500]"
              style={{
                background: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-accent-border)',
                color: 'var(--color-accent)',
              }}
            >
              <LinkIcon size={10} strokeWidth={2.2} />
              {attachedAgent.name}
            </span>
          ) : (
            <span
              className="rounded-[6px] px-2.5 py-1 text-[11.5px]"
              style={{
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-faint)',
              }}
            >
              No agent
            </span>
          )}
        </div>
      </div>

      {/* Actions row */}
      <div
        className="flex flex-wrap items-center gap-2.5 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        {attachedAgent ? (
          /* Detach button */
          <button
            type="button"
            onClick={() => void onDetach(attachedAgent)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-[500] transition-colors duration-[140ms] disabled:opacity-40"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            {busy ? <Loader2 size={11} strokeWidth={2} className="animate-spin" /> : <Unlink size={11} strokeWidth={2} />}
            Detach
          </button>
        ) : (
          /* Agent picker + Attach button */
          <>
            <AgentSelect
              value={attachTo}
              onChange={setAttachTo}
              agents={agents}
            />
            <button
              type="button"
              disabled={!attachTo || busy}
              onClick={() => void onAttach(number.phoneNumber, attachTo)}
              className="flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-[500] transition-colors duration-[140ms] disabled:opacity-40"
              style={{
                background: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-accent-border)',
                color: 'var(--color-accent)',
              }}
            >
              {busy ? <Loader2 size={11} strokeWidth={2} className="animate-spin" /> : <LinkIcon size={11} strokeWidth={2} />}
              Attach
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AgentSelect({
  value,
  onChange,
  agents,
}: {
  value: string;
  onChange: (id: string) => void;
  agents: Agent[];
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const available = agents.filter((a) => !a.phoneNumber);
  const selected = available.find((a) => a.agentId === value);

  const openDropdown = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 240),
      zIndex: 9999,
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleMousedown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? () => setOpen(false) : openDropdown}
        className="flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[12px] transition-all duration-[140ms]"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          color: selected ? 'var(--color-text)' : 'var(--color-text-faint)',
          minWidth: 200,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = open ? 'var(--color-accent-border)' : 'var(--color-border)'; }}
      >
        <span className="flex-1 truncate text-left">
          {selected ? `${selected.name} (${selected.agentId})` : 'Select agent to attach…'}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className="flex-shrink-0 transition-transform duration-[140ms]"
          style={{
            color: 'var(--color-text-faint)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex flex-col overflow-hidden rounded-[10px] py-1"
          style={{
            ...dropdownStyle,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {available.length === 0 ? (
            <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
              All agents already have a number
            </p>
          ) : (
            available.map((a) => {
              const isSelected = a.agentId === value;
              return (
                <button
                  key={a.agentId}
                  type="button"
                  onClick={() => { onChange(a.agentId); setOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors duration-[100ms]"
                  style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text)', background: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-elevated)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {isSelected ? (
                    <Check size={11} strokeWidth={2.5} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 11, flexShrink: 0 }} />
                  )}
                  <span className="flex-1 truncate">
                    <span className="font-[500]">{a.name}</span>
                    <span style={{ color: 'var(--color-text-faint)' }}> ({a.agentId})</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

function EmptyNumbers({ onBuy }: { onBuy: () => void }) {
  return (
    <div
      className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[16px] px-6 py-16 text-center"
      style={{ border: '1px dashed var(--color-border-strong)', background: 'var(--color-surface-raised)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background: 'radial-gradient(ellipse 60% 100% at 50% 0%, var(--color-accent-subtle), transparent 70%)',
        }}
      />

      <div
        className="relative flex items-center justify-center rounded-[16px]"
        style={{
          width: 52,
          height: 52,
          background: 'var(--color-accent-subtle)',
          border: '1px solid var(--color-accent-hairline)',
        }}
      >
        <Phone size={22} strokeWidth={1.6} style={{ color: 'var(--color-accent)' }} />
      </div>

      <div className="relative flex flex-col items-center gap-1.5">
        <h2 className="text-[16px] font-[600] tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
          No phone numbers yet
        </h2>
        <p className="max-w-[44ch] text-[13px] leading-[1.6]" style={{ color: 'var(--color-text-muted)' }}>
          Buy a Twilio number and attach it to an agent. Inbound calls will automatically
          start a voice session with the assigned agent.
        </p>
      </div>

      <Button variant="primary" size="md" onClick={onBuy}>
        <Plus size={14} strokeWidth={2.6} />
        Buy a number
      </Button>
    </div>
  );
}

function NumbersSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-[96px] animate-pulse rounded-[12px]"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
        />
      ))}
    </div>
  );
}
