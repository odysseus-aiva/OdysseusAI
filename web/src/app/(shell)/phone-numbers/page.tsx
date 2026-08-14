'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, Loader2, LinkIcon, Phone, Plus, RefreshCw, ShoppingCart, Unlink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Section';
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

/* Column tracks and row pitch are this screen's own geometry, so they ride on
   the page root rather than the shared listing primitive. */
const LISTING_GEOMETRY = {
  '--listing-columns': 'minmax(0, 200px) minmax(0, 1fr) auto',
  '--listing-min-width': '640px',
  '--row-height': '56px',
} as CSSProperties;

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
    <div style={LISTING_GEOMETRY}>
      <header className="page__header">
        <div className="min-w-0">
          <h1 className="page__title">Phone numbers</h1>
          <p className="page__meta mt-1">
            Buy a Twilio number and attach it to an agent so inbound calls are answered
            automatically.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowBuy(true)}>
          <ShoppingCart size={16} strokeWidth={2} aria-hidden="true" />
          Buy a number
        </Button>
      </header>

      <div className="page__body">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="page__meta" role="status">
              {loading ? 'Loading…' : `${rows.length} number${rows.length !== 1 ? 's' : ''}`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
          </div>

          {/* Colour is confined to the glyph: a tinted banner fill would be
              exactly the move rule 3 forbids. */}
          {error && (
            <div className="card flex items-start gap-3" role="alert">
              <AlertCircle
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                style={{ color: 'var(--status-error)', flexShrink: 0, marginTop: 1 }}
              />
              <p
                className="m-0"
                style={{
                  color: 'var(--fg-body)',
                  fontSize: 'var(--text-caption)',
                  lineHeight: 'var(--leading-body)',
                }}
              >
                {error}
              </p>
            </div>
          )}

          {loading ? (
            <NumbersSkeleton />
          ) : rows.length === 0 ? (
            <EmptyNumbers onBuy={() => setShowBuy(true)} />
          ) : (
            <div className="listing-scroll">
              <div className="listing" role="table" aria-label="Phone numbers">
                <div className="listing__head" role="row">
                  <span role="columnheader">Number</span>
                  <span role="columnheader">Agent</span>
                  <span className="listing__right" role="columnheader">
                    <span className="sr-only">Actions</span>
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {rows.map((row) => (
                    <motion.div
                      key={row.number.phoneNumber}
                      className="listing__row"
                      role="row"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <NumberRowCells
                        row={row}
                        agents={agents}
                        actionTarget={actionTarget}
                        onDetach={handleDetach}
                        onAttach={handleAttach}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
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

function NumberRowCells({
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

  const available = agents.filter((a) => !a.phoneNumber);

  // Only mark busy for this row's in-flight action — never treat actionTarget===null as busy
  const busy =
    (attachedAgent !== null && actionTarget === attachedAgent.agentId) ||
    (attachTo !== '' && actionTarget === attachTo);

  return (
    <>
      <span className="flex min-w-0 flex-col justify-center" role="cell">
        <span className="listing__strong truncate font-mono">{number.phoneNumber}</span>
        {number.dateCreated && (
          <span
            className="num"
            style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}
          >
            Added {new Date(number.dateCreated).toLocaleDateString()}
          </span>
        )}
      </span>

      <span className="min-w-0" role="cell">
        {attachedAgent ? (
          <span className="flex min-w-0 items-center gap-2">
            <LinkIcon
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              style={{ color: 'var(--fg-muted)', flexShrink: 0 }}
            />
            <span className="truncate">{attachedAgent.name}</span>
          </span>
        ) : available.length === 0 ? (
          <span className="listing__muted">All agents already have a number</span>
        ) : (
          <Select
            value={attachTo}
            onChange={(e) => setAttachTo(e.target.value)}
            aria-label={`Agent to attach to ${number.phoneNumber}`}
          >
            <option value="">Select an agent…</option>
            {available.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {`${a.name} (${a.agentId})`}
              </option>
            ))}
          </Select>
        )}
      </span>

      <span className="listing__right" role="cell">
        {attachedAgent ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onDetach(attachedAgent)}
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden="true" />
            ) : (
              <Unlink size={16} strokeWidth={2} aria-hidden="true" />
            )}
            Detach
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={!attachTo || busy}
            onClick={() => void onAttach(number.phoneNumber, attachTo)}
          >
            {busy ? (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden="true" />
            ) : (
              <LinkIcon size={16} strokeWidth={2} aria-hidden="true" />
            )}
            Attach
          </Button>
        )}
      </span>
    </>
  );
}

function EmptyNumbers({ onBuy }: { onBuy: () => void }) {
  return (
    <EmptyState
      icon={Phone}
      title="No phone numbers yet"
      description="Buy a Twilio number and attach it to an agent. Inbound calls will automatically start a voice session with the assigned agent."
      action={
        <Button variant="primary" size="md" onClick={onBuy}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Buy a number
        </Button>
      }
    />
  );
}

/* Bars at the row pitch on a flat fill — the header stays live, nothing shimmers. */
function NumbersSkeleton() {
  return (
    <div className="listing" aria-hidden="true">
      <div className="listing__head" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center px-3" style={{ height: 'var(--row-height)' }}>
          <div
            className="w-full"
            style={{
              height: 36,
              background: 'var(--surface-hover)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
