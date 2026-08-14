'use client';

import { useMemo, useRef, useState, useId } from 'react';
import { PageHeader } from '@/components/layout/AppShell';
import { OMNI_RATE_PER_MIN } from '@/lib/config/competitor-rates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartPoint { month: number; omni: number; competitor: number; }
type CompKey  = 'retell' | 'vapi' | 'other';
type Currency = 'usd' | 'inr';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: { label: string; months: number }[] = [
  { label: '1 mo', months: 1  },
  { label: '3 mo', months: 3  },
  { label: '6 mo', months: 6  },
  { label: '1 yr', months: 12 },
];

const COMPETITORS: Record<CompKey, { label: string; shortLabel: string; defaultCost: number }> = {
  retell: { label: 'Retell AI', shortLabel: 'Retell', defaultCost: 0.20 },
  vapi:   { label: 'Vapi',     shortLabel: 'Vapi',   defaultCost: 0.20 },
  other:  { label: 'Other',    shortLabel: 'Other',  defaultCost: 0.20 },
};

const VOLUME_TIERS = [1_000, 10_000, 100_000];
const DEFAULT_EXCHANGE_RATE = 84; // 1 USD = 84 INR (approximate)

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMoney(usdValue: number, currency: Currency, rate: number): string {
  const v = currency === 'inr' ? usdValue * rate : usdValue;
  if (v === 0) return currency === 'inr' ? '₹0' : '$0';

  if (currency === 'inr') {
    if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
    if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`;
    if (v >= 1_000)      return `₹${Math.round(v).toLocaleString('en-IN')}`;
    if (v >= 1)          return `₹${v.toFixed(2)}`;
    return `₹${v.toFixed(2)}`;
  }
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 100)        return `$${Math.round(v).toLocaleString()}`;
  if (v >= 1)          return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtAxis(usdValue: number, currency: Currency, rate: number): string {
  const v = currency === 'inr' ? usdValue * rate : usdValue;
  if (v === 0) return currency === 'inr' ? '₹0' : '$0';

  if (currency === 'inr') {
    if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
    if (v >= 100_000)    return `₹${(v / 100_000).toFixed(0)}L`;
    if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}k`;
    return `₹${v.toFixed(0)}`;
  }
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000)    return `$${Math.round(v / 1_000)}k`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  if (v < 1)          return `$${v.toFixed(3)}`;
  return `$${v.toFixed(0)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SavingsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Cost & Savings"
        description="See projected gross margin and the extra profit you unlock with PyAI Omni."
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div style={{ maxWidth: 1040 }}>
          <SavingsCalculator />
        </div>
      </div>
    </div>
  );
}

// ─── Calculator (state owner) ─────────────────────────────────────────────────

function SavingsCalculator() {
  const [jcPrice,          setJcPrice]          = useState(0.99);
  const [omniRate,         setOmniRate]         = useState<number>(OMNI_RATE_PER_MIN);
  const [competitorKey,    setCompetitorKey]    = useState<CompKey>('retell');
  const [competitorCost,   setCompetitorCost]   = useState(0.20);
  const [callsPerMonth,    setCallsPerMonth]    = useState(1_000);
  const [avgDurationMin,   setAvgDurationMin]   = useState(3);
  const [projectionMonths, setProjectionMonths] = useState(12);
  const [currency,         setCurrency]         = useState<Currency>('usd');
  const [exchangeRate,     setExchangeRate]     = useState(DEFAULT_EXCHANGE_RATE);

  const competitorLabel = COMPETITORS[competitorKey].label;

  const calc = useMemo(() => {
    const minsPerMonth     = callsPerMonth * avgDurationMin;
    const omniMarginPerMin = jcPrice - omniRate;
    const compMarginPerMin = jcPrice - competitorCost;
    const totalOmniMargin  = omniMarginPerMin * minsPerMonth * projectionMonths;
    const totalCompMargin  = compMarginPerMin * minsPerMonth * projectionMonths;
    const extraBySwitch    = totalOmniMargin - totalCompMargin;
    const omniMarginPct    = jcPrice > 0 ? (omniMarginPerMin / jcPrice) * 100 : 0;
    const compMarginPct    = jcPrice > 0 ? (compMarginPerMin / jcPrice) * 100 : 0;
    const marginGainPct    = totalCompMargin > 0 ? (extraBySwitch / totalCompMargin) * 100 : 0;
    const points: ChartPoint[] = Array.from({ length: projectionMonths + 1 }, (_, i) => ({
      month:      i,
      omni:       omniMarginPerMin * minsPerMonth * i,
      competitor: compMarginPerMin * minsPerMonth * i,
    }));
    return {
      minsPerMonth, omniMarginPerMin, compMarginPerMin,
      totalOmniMargin, totalCompMargin, extraBySwitch,
      omniMarginPct, compMarginPct, marginGainPct, points,
    };
  }, [jcPrice, omniRate, competitorCost, callsPerMonth, avgDurationMin, projectionMonths]);

  function handleCompetitorChange(key: CompKey) {
    setCompetitorKey(key);
    setCompetitorCost(COMPETITORS[key].defaultCost);
  }

  const fmt = (usdValue: number) => fmtMoney(usdValue, currency, exchangeRate);
  const fmtAx = (usdValue: number) => fmtAxis(usdValue, currency, exchangeRate);

  // Convert USD state value to display currency for inputs
  const toDisplay = (usdValue: number) =>
    currency === 'inr' ? usdValue * exchangeRate : usdValue;
  // Convert display currency input back to USD for state
  const fromDisplay = (displayValue: number) =>
    currency === 'inr' ? displayValue / exchangeRate : displayValue;

  const currSymbol = currency === 'inr' ? '₹' : '$';

  return (
    <div className="flex flex-col gap-5">

      {/* Margin hero */}
      <MarginHero
        totalOmniMargin={calc.totalOmniMargin}
        totalCompMargin={calc.totalCompMargin}
        extraBySwitch={calc.extraBySwitch}
        omniMarginPct={calc.omniMarginPct}
        compMarginPct={calc.compMarginPct}
        marginGainPct={calc.marginGainPct}
        competitorLabel={competitorLabel}
        projectionMonths={projectionMonths}
        fmt={fmt}
        currency={currency}
        setCurrency={setCurrency}
      />

      {/* Two columns */}
      <div className="flex gap-5 items-start">

        {/* Input panel */}
        <InputPanel
          jcPrice={jcPrice}
          setJcPrice={(v) => setJcPrice(fromDisplay(v))}
          omniRate={omniRate}
          setOmniRate={(v) => setOmniRate(fromDisplay(v))}
          competitorKey={competitorKey}
          setCompetitorKey={handleCompetitorChange}
          competitorCost={competitorCost}
          setCompetitorCost={(v) => setCompetitorCost(fromDisplay(v))}
          callsPerMonth={callsPerMonth}
          setCallsPerMonth={setCallsPerMonth}
          avgDurationMin={avgDurationMin}
          setAvgDurationMin={setAvgDurationMin}
          currency={currency}
          exchangeRate={exchangeRate}
          setExchangeRate={setExchangeRate}
          toDisplay={toDisplay}
          currSymbol={currSymbol}
        />

        {/* Chart column */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Controls row: period tabs */}
          <div className="flex items-center gap-3">

            {/* Period tabs */}
            {PERIODS.map((p) => {
              const active = projectionMonths === p.months;
              return (
                <button
                  key={p.months}
                  onClick={() => setProjectionMonths(p.months)}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-[500] transition-all duration-150"
                  style={{
                    background: active ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                    color: active ? 'var(--color-void)' : 'var(--color-text-muted)',
                    border: `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
                  }}
                >
                  {p.label}
                </button>
              );
            })}

            <span
              className="ml-auto text-[11px]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Cumulative projected margin
            </span>
          </div>

          <SavingsGapChart
            points={calc.points}
            competitorLabel={competitorLabel}
            fmt={fmt}
            fmtAx={fmtAx}
          />
        </div>
      </div>

      {/* Switching benefit — last section */}
      <SwitchingBenefitCard
        jcPrice={jcPrice}
        omniRate={omniRate}
        omniMarginPerMin={calc.omniMarginPerMin}
        compMarginPerMin={calc.compMarginPerMin}
        competitorCost={competitorCost}
        minsPerMonth={calc.minsPerMonth}
        projectionMonths={projectionMonths}
        extraBySwitch={calc.extraBySwitch}
        competitorLabel={competitorLabel}
        fmt={fmt}
      />

      {/* Disclaimer */}
      <p
        className="text-[10.5px] leading-[1.6]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        Projections are illustrative estimates based on your inputs and publicly listed competitor
        pricing as of August 2025. Actual costs vary by model selection, usage tier, and provider
        configuration.&nbsp;Sources: retellai.com/pricing · vapi.ai/pricing · bland.ai/pricing
        {currency === 'inr' && (
          <>&nbsp;· INR conversion at ₹{exchangeRate}/USD (approximate).</>
        )}
      </p>
    </div>
  );
}

// ─── Margin hero ──────────────────────────────────────────────────────────────

const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden';

function MarginHero({
  totalOmniMargin,
  totalCompMargin,
  extraBySwitch,
  omniMarginPct,
  compMarginPct,
  marginGainPct,
  competitorLabel,
  projectionMonths,
  fmt,
  currency,
  setCurrency,
}: {
  totalOmniMargin: number;
  totalCompMargin: number;
  extraBySwitch: number;
  omniMarginPct: number;
  compMarginPct: number;
  marginGainPct: number;
  competitorLabel: string;
  projectionMonths: number;
  fmt: (usdValue: number) => string;
  currency: Currency;
  setCurrency: (c: Currency) => void;
}) {
  const periodLabel =
    projectionMonths === 1
      ? '1 month'
      : projectionMonths === 12
      ? '1 year'
      : `${projectionMonths} months`;

  return (
    <div
      className="rounded-[16px] p-6 relative overflow-hidden"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 45% 80% at 0% 50%, color-mix(in srgb, var(--color-state-speaking) 8%, transparent), transparent 60%)',
        }}
      />

      <div className="relative flex flex-col gap-4">

        {/* Header row with currency switcher */}
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-[600] uppercase tracking-[0.09em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            Gross margin · {periodLabel}
          </span>
          <div
            className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1"
            style={{
              background: 'color-mix(in srgb, var(--color-state-speaking) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-state-speaking) 25%, transparent)',
            }}
          >
            <span className="text-[13px] font-[700]" style={{ color: 'var(--color-state-speaking)' }}>
              +{marginGainPct.toFixed(1)}%
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--color-state-speaking)', opacity: 0.75 }}>
              more margin with PyAI Omni
            </span>
          </div>

          {/* Currency switcher — top right */}
          <div className="ml-auto flex rounded-[7px] p-0.5 gap-0.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {(['usd', 'inr'] as Currency[]).map((c) => {
              const active = currency === c;
              return (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className="rounded-[5px] px-2.5 py-1 text-[11.5px] font-[600] transition-all duration-150"
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-void)' : 'var(--color-text-faint)',
                  }}
                >
                  {c === 'usd' ? '$ USD' : '₹ INR'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Three cards: Extra savings (most prominent) | With PyAI | Without PyAI */}
        <div className="flex gap-4">

          {/* EXTRA SAVINGS — most prominent, first */}
          <div
            className="flex-[1.2] rounded-[12px] p-5 relative overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              border: '2px solid var(--color-state-speaking)',
              boxShadow: '0 0 28px color-mix(in srgb, var(--color-state-speaking) 18%, transparent)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 100% 70% at 0% 50%, color-mix(in srgb, var(--color-state-speaking) 14%, transparent), transparent)',
              }}
            />
            <div className="relative flex flex-col gap-2">
              <span
                className="text-[10.5px] font-[600] uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-state-speaking)', opacity: 0.85 }}
              >
                Extra profit · vs {competitorLabel}
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono font-[700] leading-none tracking-[-0.04em]"
                  style={{ fontSize: 'clamp(34px, 4.4vw, 52px)', color: 'var(--color-state-speaking)' }}
                >
                  +{fmt(extraBySwitch)}
                </span>
                <span style={{ fontSize: 20, color: 'var(--color-state-speaking)' }}>↑</span>
              </div>
              <span className="text-[12px] font-[500]" style={{ color: 'var(--color-state-speaking)', opacity: 0.7 }}>
                by switching from {competitorLabel}
              </span>
            </div>
          </div>

          {/* WITH PyAI */}
          <div
            className="flex-1 rounded-[12px] p-5 relative overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid color-mix(in srgb, var(--color-state-speaking) 55%, var(--color-border))',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 80% 50% at 0% 50%, color-mix(in srgb, var(--color-state-speaking) 6%, transparent), transparent)',
              }}
            />
            <div className="relative flex flex-col gap-2">
              <span
                className="text-[10.5px] font-[600] uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-state-speaking)', opacity: 0.7 }}
              >
                With PyAI Omni
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono font-[700] leading-none tracking-[-0.04em]"
                  style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-state-speaking)' }}
                >
                  {fmt(totalOmniMargin)}
                </span>
                <span style={{ fontSize: 15, color: 'var(--color-state-speaking)', opacity: 0.75 }}>↑</span>
              </div>
              <span className="text-[11.5px]" style={{ color: 'var(--color-state-speaking)', opacity: 0.55 }}>
                {omniMarginPct.toFixed(1)}% gross margin
              </span>
            </div>
          </div>

          {/* WITHOUT PyAI */}
          <div
            className="flex-1 rounded-[12px] p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex flex-col gap-2">
              <span
                className="text-[10.5px] font-[600] uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Without PyAI · vs {competitorLabel}
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono font-[700] leading-none tracking-[-0.04em]"
                  style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--color-text-muted)' }}
                >
                  {fmt(totalCompMargin)}
                </span>
                <span style={{ fontSize: 15, color: 'var(--color-text-faint)' }}>↓</span>
              </div>
              <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
                {compMarginPct.toFixed(1)}% gross margin
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Input panel ──────────────────────────────────────────────────────────────

function InputPanel({
  jcPrice,
  setJcPrice,
  omniRate,
  setOmniRate,
  competitorKey,
  setCompetitorKey,
  competitorCost,
  setCompetitorCost,
  callsPerMonth,
  setCallsPerMonth,
  avgDurationMin,
  setAvgDurationMin,
  currency,
  exchangeRate,
  setExchangeRate,
  toDisplay,
  currSymbol,
}: {
  jcPrice: number;
  setJcPrice: (v: number) => void;
  omniRate: number;
  setOmniRate: (v: number) => void;
  competitorKey: CompKey;
  setCompetitorKey: (key: CompKey) => void;
  competitorCost: number;
  setCompetitorCost: (v: number) => void;
  callsPerMonth: number;
  setCallsPerMonth: (v: number) => void;
  avgDurationMin: number;
  setAvgDurationMin: (v: number) => void;
  currency: Currency;
  exchangeRate: number;
  setExchangeRate: (v: number) => void;
  toDisplay: (usdValue: number) => number;
  currSymbol: string;
}) {
  const minPrice = currency === 'inr' ? 0.01 : 0.001;
  const stepPrice = currency === 'inr' ? 0.5 : 0.01;

  return (
    <div
      className="flex flex-col gap-5 rounded-[14px] p-5 shrink-0"
      style={{
        width: 272,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* JustCall selling price */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-[600] uppercase tracking-[0.09em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            JustCall selling price
          </span>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
            {currSymbol}/min
          </span>
        </div>
        <input
          type="number"
          value={Number(toDisplay(jcPrice).toFixed(currency === 'inr' ? 2 : 3))}
          onChange={(e) =>
            setJcPrice(Math.max(minPrice, parseFloat(e.target.value) || 0))
          }
          step={stepPrice}
          min={minPrice}
          className={`w-full rounded-[7px] px-3 py-1.5 text-[13px] font-mono font-[600] ${NO_SPINNER}`}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            color: 'var(--color-text)',
            outline: 'none',
            cursor: 'text',
          }}
        />
      </div>

      {/* PyAI Omni price */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-[600] uppercase tracking-[0.09em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            PyAI Omni
          </span>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
            {currSymbol}/min
          </span>
        </div>
        <input
          type="number"
          value={Number(toDisplay(omniRate).toFixed(currency === 'inr' ? 2 : 4))}
          onChange={(e) =>
            setOmniRate(Math.max(minPrice, parseFloat(e.target.value) || 0))
          }
          step={stepPrice}
          min={minPrice}
          className={`w-full rounded-[7px] px-3 py-1.5 text-[13px] font-mono font-[600] ${NO_SPINNER}`}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-accent)',
            outline: 'none',
            cursor: 'text',
          }}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Competitor tabs + cost */}
      <div className="flex flex-col gap-3">
        <span
          className="text-[11px] font-[600] uppercase tracking-[0.09em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          Compare against
        </span>

        <div
          className="flex rounded-[8px] p-0.5 gap-0.5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {(Object.keys(COMPETITORS) as CompKey[]).map((key) => {
            const active = competitorKey === key;
            return (
              <button
                key={key}
                onClick={() => setCompetitorKey(key)}
                className="flex-1 rounded-[6px] py-1 text-[11px] font-[500] transition-all duration-150"
                style={{
                  background: active ? 'var(--color-surface-raised)' : 'transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-text-faint)',
                  border: active ? '1px solid var(--color-border)' : '1px solid transparent',
                }}
              >
                {COMPETITORS[key].shortLabel}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>
            Cost
          </span>
          <input
            type="number"
            value={Number(toDisplay(competitorCost).toFixed(currency === 'inr' ? 2 : 3))}
            onChange={(e) =>
              setCompetitorCost(Math.max(minPrice, parseFloat(e.target.value) || 0))
            }
            step={stepPrice}
            min={minPrice}
            className={`flex-1 rounded-[7px] px-2 py-1.5 text-[12px] font-mono text-right ${NO_SPINNER}`}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              outline: 'none',
              cursor: 'text',
            }}
          />
          <span className="text-[10.5px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>
            {currSymbol}/min
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Usage sliders */}
      <SliderInput
        label="Calls / month"
        value={callsPerMonth}
        onChange={setCallsPerMonth}
        min={100}
        max={50_000}
        step={100}
        display={callsPerMonth.toLocaleString()}
      />
      <SliderInput
        label="Avg duration"
        value={avgDurationMin}
        onChange={setAvgDurationMin}
        min={0.5}
        max={30}
        step={0.5}
        display={`${avgDurationMin} min`}
      />

      {/* Exchange rate — shown only when INR selected */}
      {currency === 'inr' && (
        <>
          <div style={{ borderTop: '1px solid var(--color-border)' }} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-[500]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Exchange rate
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
                ₹ / USD
              </span>
            </div>
            <input
              type="number"
              value={exchangeRate}
              onChange={(e) =>
                setExchangeRate(Math.max(1, parseFloat(e.target.value) || DEFAULT_EXCHANGE_RATE))
              }
              step={0.5}
              min={1}
              className={`w-full rounded-[7px] px-3 py-1.5 text-[12.5px] font-mono ${NO_SPINNER}`}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                outline: 'none',
                cursor: 'text',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Slider input ─────────────────────────────────────────────────────────────

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-[450]" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <span className="font-mono text-[13px] font-[600]" style={{ color: 'var(--color-text)' }}>
          {display}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div
          className="absolute w-full rounded-full pointer-events-none"
          style={{ height: 3, background: 'var(--color-surface-elevated)' }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ height: 3, width: `${pct}%`, background: 'var(--color-accent)', opacity: 0.75 }}
        />
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: 14,
            height: 14,
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            background: 'var(--color-accent)',
            boxShadow: '0 0 0 3px var(--color-surface-raised), 0 0 0 4.5px var(--color-accent)',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

// ─── Switching benefit card (last section) ────────────────────────────────────

function SwitchingBenefitCard({
  jcPrice,
  omniRate,
  omniMarginPerMin,
  compMarginPerMin,
  competitorCost,
  minsPerMonth,
  projectionMonths,
  extraBySwitch,
  competitorLabel,
  fmt,
}: {
  jcPrice: number;
  omniRate: number;
  omniMarginPerMin: number;
  compMarginPerMin: number;
  competitorCost: number;
  minsPerMonth: number;
  projectionMonths: number;
  extraBySwitch: number;
  competitorLabel: string;
  fmt: (usdValue: number) => string;
}) {
  const periodLabel =
    projectionMonths === 1
      ? '1 month'
      : projectionMonths === 12
      ? '1 year'
      : `${projectionMonths} months`;

  const maxMargin       = omniMarginPerMin * VOLUME_TIERS[VOLUME_TIERS.length - 1];
  const switchDeltaPerMin = omniMarginPerMin - compMarginPerMin;

  return (
    <div
      className="rounded-[16px] p-6 relative overflow-hidden"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 25% 60% at 8% 50%, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col gap-6">

        {/* Header */}
        <div>
          <span
            className="text-[11px] font-[600] uppercase tracking-[0.09em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            Extra profit by switching to PyAI Omni
          </span>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            vs {competitorLabel} · (${jcPrice.toFixed(2)} − ${omniRate.toFixed(3)}) vs ($
            {jcPrice.toFixed(2)} − ${competitorCost.toFixed(3)})
          </p>
        </div>

        {/* Volume bar comparison */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-[600] uppercase tracking-[0.08em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Total margin by volume (per month)
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <LegendDot color="var(--color-state-speaking)" label="PyAI Omni" />
              <LegendDot color="rgba(255,255,255,0.18)" label={competitorLabel} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {VOLUME_TIERS.map((mins) => {
              const omniProfit = omniMarginPerMin * mins;
              const compProfit = compMarginPerMin * mins;
              const omniPct    = maxMargin > 0 ? (omniProfit / maxMargin) * 100 : 0;
              const compPct    = maxMargin > 0 ? (compProfit / maxMargin) * 100 : 0;
              const volLabel   =
                mins >= 1_000 ? `${(mins / 1_000).toFixed(0)}k min/mo` : `${mins} min/mo`;
              return (
                <div key={mins} className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
                    {volLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full"
                      style={{
                        height: 10,
                        width: `${omniPct}%`,
                        minWidth: 4,
                        background: 'var(--color-state-speaking)',
                        opacity: 0.9,
                      }}
                    />
                    <span className="font-mono text-[11.5px] font-[700] shrink-0" style={{ color: 'var(--color-state-speaking)' }}>
                      {fmt(omniProfit)}
                    </span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--color-state-speaking)', opacity: 0.55 }}>
                      Omni
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full"
                      style={{
                        height: 10,
                        width: `${compPct}%`,
                        minWidth: 4,
                        background: 'rgba(255,255,255,0.16)',
                      }}
                    />
                    <span className="font-mono text-[11.5px] font-[600] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {fmt(compProfit)}
                    </span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>
                      {competitorLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Switching savings table */}
        <div className="flex flex-col gap-3">
          <div>
            <span
              className="text-[11px] font-[600] uppercase tracking-[0.08em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Additional margin by switching — per month
            </span>
            <p
              className="text-[10.5px] mt-0.5"
              style={{ color: 'var(--color-text-faint)', opacity: 0.65 }}
            >
              (Omni margin − {competitorLabel} margin) × minutes
            </p>
          </div>

          <div
            className="rounded-[10px] overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <div
              className="flex"
              style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
            >
              <span
                className="py-2 px-3 text-[10.5px] font-[600] uppercase tracking-[0.07em]"
                style={{ width: 120, color: 'var(--color-text-faint)', borderRight: '1px solid var(--color-border)' }}
              >
                Volume
              </span>
              <span
                className="flex-1 py-2 px-3 text-[10.5px] font-[600] uppercase tracking-[0.07em] text-right"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Extra vs {competitorLabel}
              </span>
            </div>

            {VOLUME_TIERS.map((mins, ri) => {
              const gain     = switchDeltaPerMin * mins;
              const volLabel =
                mins >= 1_000 ? `${(mins / 1_000).toFixed(0)}k min/mo` : `${mins} min/mo`;
              return (
                <div
                  key={mins}
                  className="flex"
                  style={{
                    borderBottom: ri < VOLUME_TIERS.length - 1 ? '1px solid var(--color-border)' : undefined,
                    background: ri % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                  }}
                >
                  <span
                    className="py-2.5 px-3 font-mono text-[11.5px]"
                    style={{ width: 120, color: 'var(--color-text-faint)', borderRight: '1px solid var(--color-border)' }}
                  >
                    {volLabel}
                  </span>
                  <span
                    className="flex-1 py-2.5 px-3 font-mono text-[12px] font-[700] text-right"
                    style={{ color: gain > 0 ? 'var(--color-state-speaking)' : 'var(--color-text-faint)' }}
                  >
                    {gain > 0 ? '+' : ''}{fmt(gain)}/mo
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Your usage summary row */}
        <div
          className="flex items-center justify-between rounded-[10px] px-4 py-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
            Extra profit from switching · {periodLabel}
            <span className="ml-2 text-[10.5px]">
              ({minsPerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} min/mo ×
              ${switchDeltaPerMin.toFixed(3)}/min × {projectionMonths} mo)
            </span>
          </span>
          <span
            className="font-mono font-[700] text-[18px] shrink-0"
            style={{ color: extraBySwitch > 0 ? 'var(--color-state-speaking)' : 'var(--color-text-faint)' }}
          >
            {extraBySwitch > 0 ? '+' : ''}{fmt(extraBySwitch)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Legend dot ───────────────────────────────────────────────────────────────

function LegendDot({ color, label, fill, muted }: {
  color: string; label: string; fill?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {fill ? (
        <span
          className="rounded-[2px]"
          style={{ width: 12, height: 8, background: color, opacity: 0.45, display: 'block' }}
        />
      ) : (
        <span
          className="rounded-full"
          style={{ width: 8, height: 8, background: color, opacity: muted ? 0.65 : 1, display: 'block' }}
        />
      )}
      <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
    </div>
  );
}

// ─── Savings gap chart ────────────────────────────────────────────────────────

function SavingsGapChart({
  points,
  competitorLabel,
  fmt,
  fmtAx,
}: {
  points: ChartPoint[];
  competitorLabel: string;
  fmt: (usdValue: number) => string;
  fmtAx: (usdValue: number) => string;
}) {
  const uid    = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered,     setHovered]     = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);

  const n = points.length;
  if (n < 2) return null;

  const VW = 800;
  const VH = 290;
  const PL = 68;
  const PR = 110;
  const PT = 18;
  const PB = 30;
  const CW = VW - PL - PR;
  const CH = VH - PT - PB;
  const BASE = PT + CH;

  const maxOmni = points[n - 1].omni;
  const maxY    = maxOmni > 0 ? maxOmni * 1.18 : 1;

  const xAt = (idx: number) => PL + (idx / (n - 1)) * CW;
  const yAt = (v: number)   => PT + CH - (v / maxY) * CH;

  const omniD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.omni)}`).join(' ');
  const compD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.competitor)}`).join(' ');

  const gapD = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.competitor)}`),
    ...points.slice().reverse().map((p, i) => `L ${xAt(n - 1 - i)} ${yAt(p.omni)}`),
    'Z',
  ].join(' ');

  const omniAreaD = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.omni)}`),
    `L ${xAt(n - 1)} ${BASE}`,
    `L ${xAt(0)} ${BASE}`,
    'Z',
  ].join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: maxY * f, y: yAt(maxY * f) }));

  const xLabelIndices = Array.from(
    new Set(
      [
        0,
        n > 3 ? Math.floor(n / 4) : -1,
        Math.floor((n - 1) / 2),
        n > 3 ? Math.floor((3 * (n - 1)) / 4) : -1,
        n - 1,
      ].filter((i) => i >= 0 && i < n),
    ),
  );

  const yOmniEnd = yAt(points[n - 1].omni);
  const yCompEnd = yAt(points[n - 1].competitor);
  const minSep   = 38;
  const rawSep   = Math.abs(yCompEnd - yOmniEnd);
  let omniAnnotY = yOmniEnd;
  let compAnnotY = yCompEnd;
  if (rawSep < minSep) {
    const nudge = (minSep - rawSep) / 2;
    omniAnnotY -= nudge;
    compAnnotY += nudge;
  }

  const bandW = CW / Math.max(n - 1, 1);

  function handleMouseEnter(e: React.MouseEvent<SVGRectElement>, i: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltipLeft((xAt(i) - PL) * (rect.width / VW));
    setHovered(i);
  }

  return (
    <div
      className="rounded-[14px] p-4 relative"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-4 mb-3 px-1">
        <LegendDot color="var(--color-state-speaking)" label="PyAI Omni" />
        <LegendDot color="var(--color-state-error)" label={`${competitorLabel} (est.)`} muted />
        <LegendDot color="#22c55e" label="Extra margin" fill />
      </div>

      <div className="relative select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 290, display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={`${uid}-gap`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${uid}-omni`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <line key={t.value} x1={PL} y1={t.y} x2={VW - PR} y2={t.y}
              stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
          ))}

          {yTicks.filter((t) => t.value > 0).map((t) => (
            <text key={t.value} x={PL - 8} y={t.y + 4} textAnchor="end"
              fontSize="11" fill="rgba(255,255,255,0.22)" fontFamily="ui-monospace,monospace">
              {fmtAx(t.value)}
            </text>
          ))}

          {xLabelIndices.map((i) => (
            <text key={i} x={xAt(i)} y={VH - 5} textAnchor="middle"
              fontSize="10" fill="rgba(255,255,255,0.22)" fontFamily="ui-monospace,monospace">
              {points[i].month === 0 ? 'now' : `mo ${points[i].month}`}
            </text>
          ))}

          <path d={omniAreaD} fill={`url(#${uid}-omni)`} />
          <path d={gapD}      fill={`url(#${uid}-gap)`} />

          <path d={compD} fill="none" stroke="var(--color-state-error)"
            strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" opacity="0.75" />
          <path d={omniD} fill="none" stroke="var(--color-state-speaking)"
            strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />

          {/* Competitor annotation (lower) */}
          <g transform={`translate(${xAt(n - 1) + 10}, ${compAnnotY})`}>
            <text y="4" fontSize="12" fill="var(--color-state-error)"
              fontFamily="ui-monospace,monospace" fontWeight="600" opacity="0.9">
              {fmt(points[n - 1].competitor)}
            </text>
            <text y="17" fontSize="9.5" fill="rgba(255,255,255,0.32)" fontFamily="ui-monospace,monospace">
              {competitorLabel}
            </text>
          </g>

          {/* Omni annotation (higher) */}
          <g transform={`translate(${xAt(n - 1) + 10}, ${omniAnnotY})`}>
            <text y="4" fontSize="12" fill="var(--color-state-speaking)"
              fontFamily="ui-monospace,monospace" fontWeight="600">
              {fmt(points[n - 1].omni)}
            </text>
            <text y="17" fontSize="9.5" fill="rgba(255,255,255,0.32)" fontFamily="ui-monospace,monospace">
              PyAI Omni
            </text>
          </g>

          {hovered !== null && hovered > 0 && (
            <line x1={xAt(hovered)} y1={PT} x2={xAt(hovered)} y2={BASE}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
          )}

          {hovered !== null && hovered > 0 && (
            <>
              <circle cx={xAt(hovered)} cy={yAt(points[hovered].competitor)} r="4.5"
                fill="var(--color-state-error)" stroke="var(--color-surface-raised)"
                strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <circle cx={xAt(hovered)} cy={yAt(points[hovered].omni)} r="4.5"
                fill="var(--color-state-speaking)" stroke="var(--color-surface-raised)"
                strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}

          {points.map((_, i) => (
            <rect key={i} x={xAt(i) - bandW / 2} y={PT} width={bandW} height={CH}
              fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseEnter={(e) => handleMouseEnter(e, i)}
              onMouseLeave={() => setHovered(null)} />
          ))}
        </svg>

        {hovered !== null && hovered > 0 && (
          <div
            className="pointer-events-none absolute z-20 flex flex-col gap-1.5 rounded-[9px] px-3 py-2.5 text-[11.5px] whitespace-nowrap"
            style={{
              top: 8,
              left: tooltipLeft,
              transform: tooltipLeft > 300 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: '0 4px 20px rgb(0 0 0 / 0.32)',
            }}
          >
            <span className="font-[600]" style={{ color: 'var(--color-text-muted)' }}>
              Month {points[hovered].month}
            </span>
            <TooltipRow dot="var(--color-state-speaking)" label="PyAI Omni"
              value={fmt(points[hovered].omni)} />
            <TooltipRow dot="var(--color-state-error)" label={competitorLabel}
              value={fmt(points[hovered].competitor)} />
            <div
              className="flex items-center justify-between gap-6 pt-1.5"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text-faint)' }}>Extra margin</span>
              <span className="font-mono font-[700]" style={{ color: 'var(--color-state-speaking)' }}>
                {fmt(Math.max(0, points[hovered].omni - points[hovered].competitor))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tooltip row ──────────────────────────────────────────────────────────────

function TooltipRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 justify-between">
      <div className="flex items-center gap-1.5">
        <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: dot }} />
        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <span className="font-mono font-[600] pl-4" style={{ color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  );
}
