'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Field, Input, SegmentedControl } from '@/components/ui/Field';
import { LINE_COMPARE, LINE_STROKE } from '@/components/charts/format';
import { OMNI_RATE_PER_MIN } from '@/lib/config/competitor-rates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartPoint { month: number; omni: number; competitor: number; }
type CompKey  = 'retell' | 'vapi' | 'other';
type Currency = 'usd' | 'inr';
type MonthsKey = '1' | '3' | '6' | '12';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: MonthsKey; label: string }[] = [
  { value: '1',  label: '1 mo' },
  { value: '3',  label: '3 mo' },
  { value: '6',  label: '6 mo' },
  { value: '12', label: '1 yr' },
];

const COMPETITORS: Record<CompKey, { label: string; shortLabel: string; defaultCost: number }> = {
  retell: { label: 'Retell AI', shortLabel: 'Retell', defaultCost: 0.20 },
  vapi:   { label: 'Vapi',     shortLabel: 'Vapi',   defaultCost: 0.20 },
  other:  { label: 'Other',    shortLabel: 'Other',  defaultCost: 0.20 },
};

const COMPETITOR_OPTIONS: { value: CompKey; label: string }[] = (
  Object.keys(COMPETITORS) as CompKey[]
).map((key) => ({ value: key, label: COMPETITORS[key].shortLabel }));

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'usd', label: '$ USD' },
  { value: 'inr', label: '₹ INR' },
];

const VOLUME_TIERS = [1_000, 10_000, 100_000];
const DEFAULT_EXCHANGE_RATE = 84; // 1 USD = 84 INR (approximate)

/** Number inputs read as figures, not steppers — the spinner is pure noise here. */
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden';

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

function volumeLabel(mins: number): string {
  return mins >= 1_000 ? `${(mins / 1_000).toFixed(0)}k min/mo` : `${mins} min/mo`;
}

function periodLabelFor(months: number): string {
  if (months === 1) return '1 month';
  if (months === 12) return '1 year';
  return `${months} months`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SavingsPage() {
  return (
    <div>
      <header className="page__header">
        <div className="min-w-0">
          <h1 className="page__title">Cost &amp; savings</h1>
          <p className="page__meta mt-1">
            See projected gross margin and the extra profit you unlock with PyAI Omni.
          </p>
        </div>
      </header>
      <div className="page__body">
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
    <div className="flex flex-col gap-8">

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
      <div className="flex flex-wrap gap-5 items-start">

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
        <div className="flex-1 flex flex-col gap-3 min-w-[320px]">

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={String(projectionMonths) as MonthsKey}
              options={PERIOD_OPTIONS}
              onChange={(next) => setProjectionMonths(Number(next))}
              label="Projection period"
            />
            <span className="page__meta ml-auto">Cumulative projected margin</span>
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

      <p
        style={{
          color: 'var(--fg-muted)',
          fontSize: 'var(--text-caption)',
          lineHeight: 'var(--leading-body)',
        }}
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
  return (
    <section className="section">
      <div className="section__head">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section__title">Gross margin · {periodLabelFor(projectionMonths)}</h2>
          {/* A coloured dot in a neutral shell: the one shape a status is allowed
              to take outside a pill. */}
          <span className="chip">
            <span className="chip__dot chip__dot--success" aria-hidden="true" />
            +{marginGainPct.toFixed(1)}% more margin with PyAI Omni
          </span>
        </div>
        <SegmentedControl
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={setCurrency}
          label="Currency"
        />
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__label">Extra profit · vs {competitorLabel}</div>
          <div className="stat__value">{extraBySwitch > 0 ? '+' : ''}{fmt(extraBySwitch)}</div>
          <div className="stat__foot">
            {extraBySwitch > 0 && (
              <span className="stat__delta" data-direction="up" aria-hidden="true">
                ↑
              </span>
            )}
            <span>by switching from {competitorLabel}</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__label">With PyAI Omni</div>
          <div className="stat__value">{fmt(totalOmniMargin)}</div>
          <div className="stat__foot">{omniMarginPct.toFixed(1)}% gross margin</div>
        </div>

        <div className="stat">
          <div className="stat__label">Without PyAI · vs {competitorLabel}</div>
          <div className="stat__value">{fmt(totalCompMargin)}</div>
          <div className="stat__foot">{compMarginPct.toFixed(1)}% gross margin</div>
        </div>
      </div>
    </section>
  );
}

// ─── Input panel ──────────────────────────────────────────────────────────────

function UnitSuffix({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}>{children}</span>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: 'var(--line-hairline)' }} />;
}

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
  const ids = useId();
  const minPrice = currency === 'inr' ? 0.01 : 0.001;
  const stepPrice = currency === 'inr' ? 0.5 : 0.01;

  return (
    <div className="card flex w-[272px] shrink-0 flex-col gap-4">
      <Field
        label="JustCall selling price"
        htmlFor={`${ids}-jc`}
        action={<UnitSuffix>{currSymbol}/min</UnitSuffix>}
      >
        <Input
          id={`${ids}-jc`}
          type="number"
          value={Number(toDisplay(jcPrice).toFixed(currency === 'inr' ? 2 : 3))}
          onChange={(e) => setJcPrice(Math.max(minPrice, parseFloat(e.target.value) || 0))}
          step={stepPrice}
          min={minPrice}
          className={NO_SPINNER}
        />
      </Field>

      <Field
        label="PyAI Omni"
        htmlFor={`${ids}-omni`}
        action={<UnitSuffix>{currSymbol}/min</UnitSuffix>}
      >
        <Input
          id={`${ids}-omni`}
          type="number"
          value={Number(toDisplay(omniRate).toFixed(currency === 'inr' ? 2 : 4))}
          onChange={(e) => setOmniRate(Math.max(minPrice, parseFloat(e.target.value) || 0))}
          step={stepPrice}
          min={minPrice}
          className={NO_SPINNER}
        />
      </Field>

      <Divider />

      <div className="flex flex-col gap-3">
        <span className="field__label mb-0">Compare against</span>
        <SegmentedControl
          value={competitorKey}
          options={COMPETITOR_OPTIONS}
          onChange={setCompetitorKey}
          label="Competitor to compare against"
        />
        <Field
          label="Cost"
          htmlFor={`${ids}-comp`}
          action={<UnitSuffix>{currSymbol}/min</UnitSuffix>}
        >
          <Input
            id={`${ids}-comp`}
            type="number"
            value={Number(toDisplay(competitorCost).toFixed(currency === 'inr' ? 2 : 3))}
            onChange={(e) => setCompetitorCost(Math.max(minPrice, parseFloat(e.target.value) || 0))}
            step={stepPrice}
            min={minPrice}
            className={NO_SPINNER}
          />
        </Field>
      </div>

      <Divider />

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
          <Divider />
          <Field
            label="Exchange rate"
            htmlFor={`${ids}-fx`}
            action={<UnitSuffix>₹ / USD</UnitSuffix>}
          >
            <Input
              id={`${ids}-fx`}
              type="number"
              value={exchangeRate}
              onChange={(e) =>
                setExchangeRate(Math.max(1, parseFloat(e.target.value) || DEFAULT_EXCHANGE_RATE))
              }
              step={0.5}
              min={1}
              className={NO_SPINNER}
            />
          </Field>
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
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  /* The native input is transparent, so its own ring would be invisible. The
     thumb wears it instead, and only for keyboard focus. */
  const [ringVisible, setRingVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="field__label mb-0">
          {label}
        </label>
        <span
          className="num"
          style={{
            color: 'var(--fg-ink)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-medium)',
          }}
        >
          {display}
        </span>
      </div>
      <div className="relative flex h-6 items-center">
        {/* Input first so the drawn track paints over it; the overlays are
            pointer-events-none, so it still owns every pointer and key event. */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onFocus={(e) => setRingVisible(e.currentTarget.matches(':focus-visible'))}
          onBlur={() => setRingVisible(false)}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
        <div
          className="pointer-events-none absolute w-full rounded-full"
          style={{ height: 3, background: 'var(--surface-selected)' }}
        />
        <div
          className="pointer-events-none absolute rounded-full"
          style={{ height: 3, width: `${pct}%`, background: 'var(--fg-ink)' }}
        />
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            width: 14,
            height: 14,
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            background: 'var(--fg-ink)',
            outline: ringVisible
              ? 'var(--focus-ring-width) solid var(--focus-ring-color)'
              : undefined,
            outlineOffset: 'var(--focus-ring-offset)',
          }}
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
  const maxMargin         = omniMarginPerMin * VOLUME_TIERS[VOLUME_TIERS.length - 1];
  const switchDeltaPerMin = omniMarginPerMin - compMarginPerMin;

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <h2 className="section__title">Extra profit by switching to PyAI Omni</h2>
          <p className="section__desc">
            vs {competitorLabel} · (${jcPrice.toFixed(2)} − ${omniRate.toFixed(3)}) vs ($
            {jcPrice.toFixed(2)} − ${competitorCost.toFixed(3)})
          </p>
        </div>
      </div>

      <div className="card flex flex-col gap-6">
        {/* Volume comparison — length carries the value, so the bars stay neutral. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="section__title">Total margin by volume (per month)</h3>
            <span className="chart__legend ml-auto" style={{ marginTop: 0 }}>
              <LegendSwatch color="var(--fg-ink)" label="PyAI Omni" />
              <LegendSwatch color="var(--fg-muted)" label={competitorLabel} />
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {VOLUME_TIERS.map((mins) => {
              const omniProfit = omniMarginPerMin * mins;
              const compProfit = compMarginPerMin * mins;
              const omniPct    = maxMargin > 0 ? (omniProfit / maxMargin) * 100 : 0;
              const compPct    = maxMargin > 0 ? (compProfit / maxMargin) * 100 : 0;
              return (
                <div key={mins} className="flex flex-col gap-2">
                  <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}>
                    {volumeLabel(mins)}
                  </span>
                  <MarginBar
                    widthPct={omniPct}
                    fill="var(--fg-ink)"
                    value={fmt(omniProfit)}
                    valueColor="var(--fg-ink)"
                    name="Omni"
                  />
                  <MarginBar
                    widthPct={compPct}
                    fill="var(--fg-muted)"
                    value={fmt(compProfit)}
                    valueColor="var(--fg-body)"
                    name={competitorLabel}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Switching savings table */}
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="section__title">Additional margin by switching — per month</h3>
            <p className="section__desc">
              (Omni margin − {competitorLabel} margin) × minutes
            </p>
          </div>

          <div className="listing-scroll">
            <table className="data-table" aria-label="Additional margin by switching, per month">
              <thead>
                <tr>
                  <th scope="col">Volume</th>
                  <th scope="col" className="data-table__right">Extra vs {competitorLabel}</th>
                </tr>
              </thead>
              <tbody>
                {VOLUME_TIERS.map((mins) => {
                  const gain = switchDeltaPerMin * mins;
                  return (
                    <tr key={mins}>
                      <td>{volumeLabel(mins)}</td>
                      <td className="data-table__right data-table__strong num">
                        {gain > 0 ? '+' : ''}{fmt(gain)}/mo
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Your usage summary row */}
        <div
          className="card flex flex-wrap items-center justify-between gap-4"
          style={{ background: 'var(--surface-recessed)' }}
        >
          <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}>
            Extra profit from switching · {periodLabelFor(projectionMonths)}
            <span className="ml-2">
              ({minsPerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} min/mo ×
              ${switchDeltaPerMin.toFixed(3)}/min × {projectionMonths} mo)
            </span>
          </span>
          {/* A figure, so it stays ink — never tinted by whether it is good news. */}
          <span
            className="num shrink-0"
            style={{
              color: 'var(--fg-ink)',
              fontSize: 'var(--text-title-md)',
              fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wordmark)',
            }}
          >
            {extraBySwitch > 0 ? '+' : ''}{fmt(extraBySwitch)}
          </span>
        </div>
      </div>
    </section>
  );
}

function MarginBar({
  widthPct,
  fill,
  value,
  valueColor,
  name,
}: {
  widthPct: number;
  fill: string;
  value: string;
  valueColor: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden="true"
        className="rounded-full"
        style={{ height: 8, width: `${widthPct}%`, minWidth: 4, background: fill }}
      />
      <span
        className="num shrink-0"
        style={{
          color: valueColor,
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-medium)',
        }}
      >
        {value}
      </span>
      <span
        className="shrink-0"
        style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-caption)' }}
      >
        {name}
      </span>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

/** The swatch is the only place a series colour appears outside the plot. A
 *  square, not a dot: a dot is the status vocabulary. */
function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="chart__swatch" style={{ background: color }} />
      <span>{label}</span>
    </span>
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

  // The region between the two lines *is* the datum this chart exists to show,
  // so it takes the accent wash. The accent series budget is one per chart.
  const gapD = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.competitor)}`),
    ...points.slice().reverse().map((p, i) => `L ${xAt(n - 1 - i)} ${yAt(p.omni)}`),
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

  function handleMouseEnter(i: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltipLeft((xAt(i) - PL) * (rect.width / VW));
    setHovered(i);
  }

  return (
    <div className="card relative">
      <div className="relative select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 290, display: 'block', overflow: 'visible' }}
        >
          {/* Gridlines are solid hairlines. A dashed line means a threshold. */}
          {yTicks.map((t) => (
            <line
              key={t.value}
              className="chart__gridline"
              x1={PL}
              y1={t.y}
              x2={VW - PR}
              y2={t.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {yTicks.filter((t) => t.value > 0).map((t) => (
            <text key={t.value} className="chart__tick" x={PL - 8} y={t.y + 4} textAnchor="end">
              {fmtAx(t.value)}
            </text>
          ))}

          {xLabelIndices.map((i) => (
            <text key={i} className="chart__tick" x={xAt(i)} y={VH - 5} textAnchor="middle">
              {points[i].month === 0 ? 'now' : `mo ${points[i].month}`}
            </text>
          ))}

          <path d={gapD} fill="var(--accent-wash)" />

          <path
            d={compD}
            fill="none"
            stroke={LINE_COMPARE}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={omniD}
            fill="none"
            stroke={LINE_STROKE}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* End-of-series annotations. The value is text, so it stays ink. */}
          <g transform={`translate(${xAt(n - 1) + 10}, ${compAnnotY})`}>
            <text y="4" fontSize="13" fontWeight="500" fill="var(--fg-ink)">
              {fmt(points[n - 1].competitor)}
            </text>
            <text y="18" fontSize="11" fill="var(--fg-muted)">
              {competitorLabel}
            </text>
          </g>

          <g transform={`translate(${xAt(n - 1) + 10}, ${omniAnnotY})`}>
            <text y="4" fontSize="13" fontWeight="500" fill="var(--fg-ink)">
              {fmt(points[n - 1].omni)}
            </text>
            <text y="18" fontSize="11" fill="var(--fg-muted)">
              PyAI Omni
            </text>
          </g>

          {hovered !== null && hovered > 0 && (
            <>
              <line
                x1={xAt(hovered)}
                y1={PT}
                x2={xAt(hovered)}
                y2={BASE}
                stroke="var(--line-strong)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xAt(hovered)}
                cy={yAt(points[hovered].competitor)}
                r="4"
                fill={LINE_COMPARE}
                stroke="var(--surface-card)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xAt(hovered)}
                cy={yAt(points[hovered].omni)}
                r="4"
                fill={LINE_STROKE}
                stroke="var(--surface-card)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {points.map((_, i) => (
            <rect key={i} x={xAt(i) - bandW / 2} y={PT} width={bandW} height={CH}
              fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseEnter={() => handleMouseEnter(i)}
              onMouseLeave={() => setHovered(null)} />
          ))}
        </svg>

        {hovered !== null && hovered > 0 && (
          <div
            className="chart__tooltip pointer-events-none whitespace-nowrap"
            role="status"
            style={{
              top: 8,
              left: tooltipLeft,
              transform: tooltipLeft > 300 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            }}
          >
            <span className="chart__tooltip-title" style={{ color: 'var(--fg-body)' }}>
              Month {points[hovered].month}
            </span>
            <TooltipRow dot={LINE_STROKE} label="PyAI Omni" value={fmt(points[hovered].omni)} />
            <TooltipRow
              dot={LINE_COMPARE}
              label={competitorLabel}
              value={fmt(points[hovered].competitor)}
            />
            <div
              className="mt-1 flex items-center justify-between gap-6 pt-2"
              style={{ borderTop: '1px solid var(--line-hairline)' }}
            >
              <span style={{ color: 'var(--fg-body)' }}>Extra margin</span>
              <span className="num" style={{ color: 'var(--fg-ink)' }}>
                {fmt(Math.max(0, points[hovered].omni - points[hovered].competitor))}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="chart__legend">
        <LegendSwatch color={LINE_STROKE} label="PyAI Omni" />
        <LegendSwatch color={LINE_COMPARE} label={`${competitorLabel} (est.)`} />
        <LegendSwatch color="var(--accent-wash)" label="Extra margin" />
      </div>
    </div>
  );
}

// ─── Tooltip row ──────────────────────────────────────────────────────────────

function TooltipRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="chart__swatch" style={{ background: dot }} />
        <span style={{ color: 'var(--fg-body)' }}>{label}</span>
      </span>
      <span className="num" style={{ color: 'var(--fg-ink)' }}>
        {value}
      </span>
    </div>
  );
}
