'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { X, Search, Phone, Check, AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  searchAvailableNumbers,
  purchaseNumber,
  type AvailableNumber,
} from '@/lib/api/twilio';

const COUNTRY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
];

/** Hairline-bordered list container. Rows are flush; only the box has a rule. */
const LIST_BOX = 'overflow-hidden rounded-md border border-[var(--line-hairline)]';

function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = COUNTRY_OPTIONS.find((c) => c.code === value) ?? COUNTRY_OPTIONS[0]!;

  const openDropdown = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Country"
        onClick={open ? () => setOpen(false) : openDropdown}
        className="input flex cursor-pointer items-center justify-between text-left hover:bg-[var(--surface-hover)]"
      >
        <span>{selected.label}</span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{
            color: 'var(--fg-muted)',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--duration-hover) var(--ease-standard)',
          }}
        />
      </button>

      {/* A popover genuinely floats, so it is one of the few things that earns
          a shadow. */}
      {open && (
        <div
          role="listbox"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...dropdownStyle,
            background: 'var(--surface-card)',
            border: '1px solid var(--line-hairline)',
            borderRadius: 8,
            padding: 4,
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {COUNTRY_OPTIONS.map((c) => {
            const active = c.code === value;
            return (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="focus-inset flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-2 text-left text-nav transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-hover)]"
                style={{
                  height: 32,
                  color: 'var(--fg-ink)',
                  background: active ? 'var(--surface-selected)' : 'transparent',
                }}
              >
                {c.label}
                {active && (
                  <Check
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                    style={{ color: 'var(--fg-ink)', flexShrink: 0 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();

  // Escape closes, Tab cycles inside the panel, and focus returns to whatever
  // opened the modal.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [onClose]);

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
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setPurchasing(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className="scrim">
      {/* Padding lives on the three regions, not the panel, so the header stays
          pinned while the body scrolls. */}
      <div
        ref={panelRef}
        className="modal flex max-h-[85dvh] flex-col p-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-start justify-between gap-4 p-5"
          style={{ borderBottom: '1px solid var(--line-hairline)' }}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="modal__title">
              Buy a number
            </h2>
            <p id={hintId} className="modal__hint">
              Search available Twilio numbers and purchase one
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {step === 'search' && (
            <>
              {/* Search controls */}
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  {/* A <label for> cannot name a button, so the trigger carries
                      its own accessible name. */}
                  <span className="field__label">Country</span>
                  <CountrySelect value={country} onChange={setCountry} />
                </div>
                <div className="w-[120px] flex-shrink-0">
                  <label className="field__label" htmlFor="buy-area-code">
                    Area code
                  </label>
                  <input
                    id="buy-area-code"
                    type="text"
                    inputMode="numeric"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="415"
                    className="input font-mono"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                  />
                </div>
                <Button
                  variant="secondary"
                  className="flex-shrink-0"
                  onClick={() => void handleSearch()}
                  loading={searching}
                >
                  {!searching && <Search size={16} strokeWidth={2} aria-hidden="true" />}
                  Search
                </Button>
              </div>

              {/* Error */}
              {searchError && <FormAlert message={searchError} />}

              {/* Results */}
              {results.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-caption"
                    style={{ color: 'var(--fg-muted)' }}
                    aria-live="polite"
                  >
                    <span className="num">{results.length}</span> numbers available
                  </span>
                  <ul className={LIST_BOX}>
                    {results.map((n, i) => (
                      <li
                        key={n.phoneNumber}
                        style={{ borderTop: i === 0 ? undefined : '1px solid var(--line-hairline)' }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(n)}
                          className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-3 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-hover)]"
                        >
                          <span className="flex min-w-0 flex-col gap-1">
                            <span
                              className="font-mono text-nav font-medium"
                              style={{ color: 'var(--fg-ink)' }}
                            >
                              {n.phoneNumber}
                            </span>
                            <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
                              {[n.locality, n.region].filter(Boolean).join(', ') || n.isoCountry}
                            </span>
                          </span>
                          <span
                            className="flex-shrink-0 text-caption font-medium"
                            style={{ color: 'var(--fg-body)' }}
                          >
                            Select
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Empty prompt */}
              {results.length === 0 && !searching && !searchError && (
                <div className="empty-state empty-state--bare">
                  <span className="empty-state__tile" aria-hidden="true">
                    <Phone size={20} strokeWidth={1.7} />
                  </span>
                  <p className="empty-state__body" style={{ marginBottom: 0 }}>
                    Choose a country and click Search to find available numbers.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'confirm' && selected && (
            <div className="flex flex-col gap-4">
              <div
                className="flex flex-col gap-2 rounded-md p-4"
                style={{
                  background: 'var(--surface-recessed)',
                  border: '1px solid var(--line-hairline)',
                }}
              >
                <span className="text-caption" style={{ color: 'var(--fg-muted)' }}>
                  Selected number
                </span>
                <span className="font-mono text-title-md font-medium" style={{ color: 'var(--fg-ink)' }}>
                  {selected.phoneNumber}
                </span>
                <span className="text-caption" style={{ color: 'var(--fg-body)' }}>
                  {[selected.locality, selected.region, selected.isoCountry].filter(Boolean).join(', ')}
                </span>
              </div>

              <p className="text-caption leading-body" style={{ color: 'var(--fg-body)' }}>
                This will purchase the number on your Twilio account and attach it to your SIP trunk.
              </p>

              {purchaseError && <FormAlert message={purchaseError} />}

              {/* Secondary first, primary last. */}
              <div className="modal__actions">
                <Button
                  variant="secondary"
                  onClick={() => { setStep('search'); setPurchaseError(null); }}
                >
                  Back
                </Button>
                <Button variant="primary" onClick={() => void handlePurchase()} loading={purchasing}>
                  {purchasing ? 'Purchasing…' : 'Purchase & Attach'}
                </Button>
              </div>
            </div>
          )}

          {step === 'success' && selected && (
            <div className="empty-state empty-state--bare">
              <span className="empty-state__tile" aria-hidden="true">
                <Check size={20} strokeWidth={2.2} style={{ color: 'var(--status-success)' }} />
              </span>
              <h3 className="empty-state__title">Number purchased</h3>
              <p className="mb-2 font-mono text-caption" style={{ color: 'var(--fg-body)' }}>
                {selected.phoneNumber}
              </p>
              <p className="empty-state__body">
                The number has been added to your phone numbers. Go to Phone Numbers to attach it to
                an agent.
              </p>
              <div className="empty-state__actions">
                <Button variant="primary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Form-level failure. A real failure is status, which is the one thing licensed
 * to carry a tint — but it still gets text and an icon, never colour alone.
 */
function FormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md p-3 text-caption leading-body"
      style={{
        background: 'var(--status-pill-error-bg)',
        color: 'var(--status-pill-error-fg)',
      }}
    >
      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" className="mt-px flex-shrink-0" />
      {message}
    </div>
  );
}
