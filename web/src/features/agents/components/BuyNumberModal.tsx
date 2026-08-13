'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Phone, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  searchAvailableNumbers,
  purchaseNumber,
  listOwnedNumbers,
  releaseNumber,
  type AvailableNumber,
  type OwnedNumber,
} from '@/lib/api/twilio';

const COUNTRY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
];

interface BuyNumberModalProps {
  onClose: () => void;
  onPurchased: (phoneNumber: string) => void;
}

type Step = 'search' | 'confirm' | 'success';

export function BuyNumberModal({ onClose, onPurchased }: BuyNumberModalProps) {
  const [step, setStep] = useState<Step>('search');
  const [country, setCountry] = useState('US');
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [tab, setTab] = useState<'buy' | 'owned'>('buy');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadOwned();
  }, []);

  const loadOwned = async () => {
    try {
      const numbers = await listOwnedNumbers();
      setOwned(numbers);
    } catch {
      // Non-critical — owned list may be unavailable if creds not set
    }
  };

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const numbers = await searchAvailableNumbers(country, areaCode || undefined);
      setResults(numbers);
      if (numbers.length === 0) setSearchError('No numbers found. Try a different area code or country.');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (number: AvailableNumber) => {
    setSelected(number);
    setStep('confirm');
    setPurchaseError(null);
  };

  const handlePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const result = await purchaseNumber(selected.phoneNumber);
      onPurchased(result.phoneNumber);
      setStep('success');
      await loadOwned();
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRelease = async (sid: string) => {
    setReleasing(sid);
    try {
      await releaseNumber(sid);
      setOwned((prev) => prev.filter((n) => n.sid !== sid));
    } catch {
      // Silently ignore — user can retry
    } finally {
      setReleasing(null);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="relative flex w-full max-w-[520px] flex-col rounded-[14px] shadow-2xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-[600]" style={{ color: 'var(--color-text)' }}>
              Phone Numbers
            </span>
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              Buy a Twilio number and attach it to this agent
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-[7px] p-1.5 transition-colors duration-[120ms]"
            style={{ color: 'var(--color-text-faint)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-raised)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Tabs */}
        {step === 'search' && (
          <div
            className="flex"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            {(['buy', 'owned'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="px-5 py-2.5 text-[12px] font-[500] transition-colors duration-[120ms]"
                style={{
                  color: tab === t ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  borderBottom: tab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}
              >
                {t === 'buy' ? 'Buy a number' : `My numbers (${owned.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          {step === 'search' && tab === 'buy' && (
            <>
              {/* Search controls */}
              <div className="flex gap-2.5">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[11px] font-[600] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="rounded-[8px] px-3 py-2 text-[13px] outline-none transition-all duration-[140ms]"
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 w-[120px]">
                  <label className="text-[11px] font-[600] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
                    Area code
                  </label>
                  <input
                    type="text"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="415"
                    className="rounded-[8px] px-3 py-2 text-[13px] outline-none transition-all duration-[140ms]"
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSearch()}
                    disabled={searching}
                    className="flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[12.5px] font-[500] transition-all duration-[140ms] disabled:opacity-50"
                    style={{
                      background: 'var(--color-accent-subtle)',
                      border: '1px solid var(--color-accent-border)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {searching ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : <Search size={13} strokeWidth={2} />}
                    Search
                  </button>
                </div>
              </div>

              {/* Error */}
              {searchError && (
                <div className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[12px]"
                  style={{ background: 'var(--color-state-error-subtle, rgba(239,68,68,0.08))', color: 'var(--color-state-error, #ef4444)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0" />
                  {searchError}
                </div>
              )}

              {/* Results */}
              {results.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-[600] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
                    {results.length} numbers available
                  </span>
                  <div className="flex flex-col gap-1">
                    {results.map((n) => (
                      <button
                        key={n.phoneNumber}
                        type="button"
                        onClick={() => handleSelect(n)}
                        className="flex items-center justify-between rounded-[9px] px-3.5 py-2.5 text-left transition-all duration-[140ms]"
                        style={{
                          background: 'var(--color-surface-raised)',
                          border: '1px solid var(--color-border)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-accent-border)';
                          e.currentTarget.style.background = 'var(--color-accent-subtle)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                          e.currentTarget.style.background = 'var(--color-surface-raised)';
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[13px] font-[550]" style={{ color: 'var(--color-text)' }}>
                            {n.phoneNumber}
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
                            {[n.locality, n.region].filter(Boolean).join(', ') || n.isoCountry}
                          </span>
                        </div>
                        <span className="text-[11.5px] font-[500]" style={{ color: 'var(--color-accent)' }}>
                          Select →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty prompt */}
              {results.length === 0 && !searching && !searchError && (
                <div className="flex flex-col items-center gap-2 py-6" style={{ color: 'var(--color-text-faint)' }}>
                  <Phone size={24} strokeWidth={1.4} />
                  <p className="text-[12.5px]">Choose a country and click Search to find available numbers.</p>
                </div>
              )}
            </>
          )}

          {step === 'search' && tab === 'owned' && (
            <div className="flex flex-col gap-2">
              {owned.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8" style={{ color: 'var(--color-text-faint)' }}>
                  <Phone size={24} strokeWidth={1.4} />
                  <p className="text-[12.5px]">No numbers in your Twilio account yet.</p>
                </div>
              ) : (
                owned.map((n) => (
                  <div
                    key={n.sid}
                    className="flex items-center justify-between rounded-[9px] px-3.5 py-2.5"
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[13px] font-[550]" style={{ color: 'var(--color-text)' }}>
                        {n.phoneNumber}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
                        {n.friendlyName}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onPurchased(n.phoneNumber);
                          onClose();
                        }}
                        className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-[500] transition-colors duration-[120ms]"
                        style={{
                          background: 'var(--color-accent-subtle)',
                          border: '1px solid var(--color-accent-border)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        Attach
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRelease(n.sid)}
                        disabled={releasing === n.sid}
                        className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-[500] transition-colors duration-[120ms] disabled:opacity-40"
                        style={{
                          background: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {releasing === n.sid ? <Loader2 size={11} className="animate-spin" /> : 'Release'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {step === 'confirm' && selected && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-[10px] px-4 py-4"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <span className="text-[11px] font-[600] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
                  Selected number
                </span>
                <span className="font-mono text-[20px] font-[600]" style={{ color: 'var(--color-text)' }}>
                  {selected.phoneNumber}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                  {[selected.locality, selected.region, selected.isoCountry].filter(Boolean).join(', ')}
                </span>
              </div>

              <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--color-text-muted)' }}>
                This will purchase the number on your Twilio account and attach it to your SIP trunk. The number will then be assigned to this agent.
              </p>

              {purchaseError && (
                <div className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[12px]"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0" />
                  {purchaseError}
                </div>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => { setStep('search'); setPurchaseError(null); }}
                  className="flex-1 rounded-[8px] py-2 text-[13px] font-[500] transition-colors duration-[140ms]"
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurchase()}
                  disabled={purchasing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[8px] py-2 text-[13px] font-[500] transition-colors duration-[140ms] disabled:opacity-50"
                  style={{
                    background: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                    color: '#fff',
                  }}
                >
                  {purchasing && <Loader2 size={13} strokeWidth={2} className="animate-spin" />}
                  {purchasing ? 'Purchasing…' : 'Purchase & Attach'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && selected && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--color-state-success-subtle, rgba(34,197,94,0.12))' }}>
                <Check size={22} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking, #22c55e)' }} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[14px] font-[600]" style={{ color: 'var(--color-text)' }}>Number purchased!</span>
                <span className="font-mono text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{selected.phoneNumber}</span>
              </div>
              <p className="text-center text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
                The number has been saved to this agent. Hit Save to persist the change.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] px-5 py-2 text-[13px] font-[500] transition-colors duration-[140ms]"
                style={{
                  background: 'var(--color-accent-subtle)',
                  border: '1px solid var(--color-accent-border)',
                  color: 'var(--color-accent)',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
