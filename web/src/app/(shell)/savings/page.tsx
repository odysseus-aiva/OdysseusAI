'use client';

import { useMemo, useRef, useState, useId } from 'react';
import { PageHeader } from '@/components/layout/AppShell';
import { OMNI_RATE_PER_MIN, COMPETITOR_RATES } from '@/lib/config/competitor-rates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartPoint {
  month: number;
  omni: number;
  competitor: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: { label: string; months: number }[] = [
  { label: '1 mo',  months: 1  },
  { label: '3 mo',  months: 3  },
  { label: '6 mo',  months: 6  },
  { label: '1 yr',  months: 12 },
];

const COMPETITOR_OPTIONS = [
  ...COMPETITOR_RATES.map((c) => ({
    label: c.name,
    value: c.name,
    rate: c.ratePerMin,
    note: c.note,
  })),
  { label: 'Custom rate', value: 'custom', rate: 0.13, note: 'Enter your own $/min rate' },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtFull(v: number): string {
  if (v === 0) return '$0';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 100) return '$' + Math.round(v).toLocaleString();
  if (v >= 1)   return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtAxis(v: number): string {
  if (v === 0) return '$0';
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
        title="Cost Projection"
        description="Adjust usage assumptions — see projected savings update in real time."
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
  const [callsPerMonth, setCallsPerMonth] = useState(1_000);
  const [avgDurationMin, setAvgDurationMin] = useState(3);
  const [omniRate, setOmniRate] = useState<number>(OMNI_RATE_PER_MIN);
  const [competitorKey, setCompetitorKey] = useState(COMPETITOR_RATES[0].name);
  const [customRate, setCustomRate] = useState(0.13);
  const [projectionMonths, setProjectionMonths] = useState(12);

  const competitorRate =
    competitorKey === 'custom'
      ? customRate
      : (COMPETITOR_RATES.find((c) => c.name === competitorKey)?.ratePerMin ?? 0.13);

  const competitorLabel = competitorKey === 'custom' ? 'Custom' : competitorKey;

  const calc = useMemo(() => {
    const minsPerMonth = callsPerMonth * avgDurationMin;
    const omniPerMonth = minsPerMonth * omniRate;
    const compPerMonth = minsPerMonth * competitorRate;
    const savePerMonth = Math.max(0, compPerMonth - omniPerMonth);
    const totalOmni = omniPerMonth * projectionMonths;
    const totalComp = compPerMonth * projectionMonths;
    const totalSave = Math.max(0, totalComp - totalOmni);
    const savePct = totalComp > 0 ? (totalSave / totalComp) * 100 : 0;
    const points: ChartPoint[] = Array.from({ length: projectionMonths + 1 }, (_, i) => ({
      month: i,
      omni: omniPerMonth * i,
      competitor: compPerMonth * i,
    }));
    return { minsPerMonth, omniPerMonth, compPerMonth, savePerMonth, totalOmni, totalComp, totalSave, savePct, points };
  }, [callsPerMonth, avgDurationMin, omniRate, competitorRate, projectionMonths]);

  return (
    <div className="flex flex-col gap-5">

      {/* Outcome hero */}
      <OutcomeHero
        totalSavings={calc.totalSave}
        savingsPct={calc.savePct}
        totalOmni={calc.totalOmni}
        totalCompetitor={calc.totalComp}
        competitorLabel={competitorLabel}
        projectionMonths={projectionMonths}
      />

      {/* Two columns */}
      <div className="flex gap-5 items-start">

        {/* Input panel */}
        <InputPanel
          callsPerMonth={callsPerMonth}
          setCallsPerMonth={setCallsPerMonth}
          avgDurationMin={avgDurationMin}
          setAvgDurationMin={setAvgDurationMin}
          omniRate={omniRate}
          setOmniRate={setOmniRate}
          competitorKey={competitorKey}
          setCompetitorKey={setCompetitorKey}
          customRate={customRate}
          setCustomRate={setCustomRate}
          minutesPerMonth={calc.minsPerMonth}
          omniMonthly={calc.omniPerMonth}
          competitorMonthly={calc.compPerMonth}
          savingsMonthly={calc.savePerMonth}
          competitorLabel={competitorLabel}
        />

        {/* Chart column */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Period tabs */}
          <div className="flex items-center gap-2">
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
              Cumulative projected cost
            </span>
          </div>

          {/* Hero chart */}
          <SavingsGapChart
            points={calc.points}
            competitorLabel={competitorLabel}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <p
        className="text-[10.5px] leading-[1.6]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        Projections are illustrative estimates based on your inputs and publicly listed competitor pricing as of August 2025.
        Actual costs vary by model selection, usage tier, and provider configuration.&nbsp;
        Sources: retellai.com/pricing · vapi.ai/pricing · bland.ai/pricing
      </p>
    </div>
  );
}

// ─── Outcome hero ─────────────────────────────────────────────────────────────

function OutcomeHero({
  totalSavings,
  savingsPct,
  totalOmni,
  totalCompetitor,
  competitorLabel,
  projectionMonths,
}: {
  totalSavings: number;
  savingsPct: number;
  totalOmni: number;
  totalCompetitor: number;
  competitorLabel: string;
  projectionMonths: number;
}) {
  const periodLabel =
    projectionMonths === 1
      ? '1 month'
      : projectionMonths === 12
      ? '1 year'
      : `${projectionMonths} months`;

  const noSavings = totalSavings <= 0;

  return (
    <div
      className="rounded-[16px] p-6 relative overflow-hidden"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: noSavings
            ? 'radial-gradient(ellipse 30% 60% at 8% 50%, color-mix(in srgb, var(--color-state-error) 5%, transparent), transparent 70%)'
            : 'radial-gradient(ellipse 30% 60% at 8% 50%, color-mix(in srgb, var(--color-state-speaking) 7%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex flex-wrap items-center gap-x-14 gap-y-5">

        {/* Big savings number */}
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] font-[500] uppercase tracking-[0.09em]"
            style={{
              color: noSavings ? 'var(--color-state-error)' : 'var(--color-state-speaking)',
              opacity: 0.75,
            }}
          >
            Projected savings · {periodLabel} · vs {competitorLabel}
          </span>
          <span
            className="font-mono font-[700] leading-none tracking-[-0.04em]"
            style={{
              fontSize: 'clamp(36px, 5vw, 54px)',
              color: noSavings ? 'var(--color-state-error)' : 'var(--color-state-speaking)',
            }}
          >
            {noSavings ? '$0' : fmtFull(totalSavings)}
          </span>
          {!noSavings && (
            <span
              className="text-[15px] font-[600]"
              style={{ color: 'var(--color-state-speaking)', opacity: 0.65 }}
            >
              {savingsPct.toFixed(1)}% cheaper than {competitorLabel}
            </span>
          )}
          {noSavings && (
            <span className="text-[13px]" style={{ color: 'var(--color-text-faint)' }}>
              PyAI Omni costs more at current rates — adjust inputs
            </span>
          )}
        </div>

        {/* Supporting numbers */}
        <div className="flex gap-8">
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10.5px] uppercase tracking-[0.07em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              You pay
            </span>
            <span
              className="font-mono font-[600] text-[22px]"
              style={{ color: 'var(--color-text)' }}
            >
              {fmtFull(totalOmni)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-accent)' }}>
              PyAI Omni
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10.5px] uppercase tracking-[0.07em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Without PyAI
            </span>
            <span
              className="font-mono font-[600] text-[22px]"
              style={{ color: 'var(--color-text)' }}
            >
              {fmtFull(totalCompetitor)}
            </span>
            <span
              className="text-[11px]"
              style={{ color: 'var(--color-state-error)', opacity: 0.8 }}
            >
              {competitorLabel}{' '}
              <span style={{ color: 'var(--color-text-faint)' }}>(est.)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Input panel ──────────────────────────────────────────────────────────────

function InputPanel({
  callsPerMonth,
  setCallsPerMonth,
  avgDurationMin,
  setAvgDurationMin,
  omniRate,
  setOmniRate,
  competitorKey,
  setCompetitorKey,
  customRate,
  setCustomRate,
  minutesPerMonth,
  omniMonthly,
  competitorMonthly,
  savingsMonthly,
  competitorLabel,
}: {
  callsPerMonth: number;
  setCallsPerMonth: (v: number) => void;
  avgDurationMin: number;
  setAvgDurationMin: (v: number) => void;
  omniRate: number;
  setOmniRate: (v: number) => void;
  competitorKey: string;
  setCompetitorKey: (v: string) => void;
  customRate: number;
  setCustomRate: (v: number) => void;
  minutesPerMonth: number;
  omniMonthly: number;
  competitorMonthly: number;
  savingsMonthly: number;
  competitorLabel: string;
}) {
  return (
    <div
      className="flex flex-col gap-5 rounded-[14px] p-5 shrink-0"
      style={{
        width: 272,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span
        className="text-[11px] font-[600] uppercase tracking-[0.09em]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        Usage assumptions
      </span>

      {/* Calls per month */}
      <SliderInput
        label="Calls / month"
        value={callsPerMonth}
        onChange={setCallsPerMonth}
        min={100}
        max={50_000}
        step={100}
        display={callsPerMonth.toLocaleString()}
      />

      {/* Avg duration */}
      <SliderInput
        label="Avg duration"
        value={avgDurationMin}
        onChange={setAvgDurationMin}
        min={0.5}
        max={30}
        step={0.5}
        display={`${avgDurationMin} min`}
      />

      {/* Derived minutes */}
      <div className="flex items-center justify-between -mt-1">
        <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
          Total min / month
        </span>
        <span
          className="font-mono text-[11.5px] font-[600]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {minutesPerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Compare against */}
      <div className="flex flex-col gap-2">
        <span
          className="text-[11px] font-[500]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          Compare against
        </span>
        <select
          value={competitorKey}
          onChange={(e) => setCompetitorKey(e.target.value)}
          className="w-full rounded-[8px] px-3 py-2 text-[12.5px]"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            outline: 'none',
          }}
        >
          {COMPETITOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — ${opt.rate}/min
            </option>
          ))}
        </select>
        {competitorKey === 'custom' && (
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] shrink-0"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Rate $/min
            </span>
            <input
              type="number"
              value={customRate}
              onChange={(e) =>
                setCustomRate(Math.max(0.001, parseFloat(e.target.value) || 0.01))
              }
              step={0.01}
              min={0.001}
              className="flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] font-mono"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* PyAI Omni rate override */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-[500]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            PyAI Omni rate
          </span>
          <span
            className="text-[10.5px]"
            style={{ color: 'var(--color-accent)', opacity: 0.65 }}
          >
            overrideable
          </span>
        </div>
        <input
          type="number"
          value={omniRate}
          onChange={(e) =>
            setOmniRate(Math.max(0.001, parseFloat(e.target.value) || 0.05))
          }
          step={0.005}
          min={0.001}
          className="w-full rounded-[7px] px-3 py-1.5 text-[12.5px] font-mono"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-accent)',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Monthly summary */}
      <div className="flex flex-col gap-2.5">
        <span
          className="text-[11px] font-[600] uppercase tracking-[0.07em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          Per month
        </span>
        <SummaryRow
          label="PyAI Omni"
          value={fmtFull(omniMonthly)}
          color="var(--color-state-speaking)"
        />
        <SummaryRow
          label={competitorLabel}
          value={fmtFull(competitorMonthly)}
          color="var(--color-state-error)"
          muted
        />
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 8,
            marginTop: 2,
          }}
        >
          <SummaryRow
            label="Monthly savings"
            value={fmtFull(savingsMonthly)}
            color={
              savingsMonthly > 0
                ? 'var(--color-state-speaking)'
                : 'var(--color-text-faint)'
            }
            bold
          />
        </div>
      </div>
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
        <span
          className="text-[11.5px] font-[450]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[13px] font-[600]"
          style={{ color: 'var(--color-text)' }}
        >
          {display}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div
          className="absolute w-full rounded-full pointer-events-none"
          style={{ height: 3, background: 'var(--color-surface-elevated)' }}
        />
        {/* Track fill */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            height: 3,
            width: `${pct}%`,
            background: 'var(--color-accent)',
            opacity: 0.75,
          }}
        />
        {/* Custom thumb */}
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
        {/* Native range (invisible) for interaction */}
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

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  color,
  bold,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className="text-[12px]"
        style={{ color: muted ? 'var(--color-text-faint)' : 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[12.5px] ${bold ? 'font-[700]' : 'font-[600]'}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Savings gap chart ────────────────────────────────────────────────────────

function SavingsGapChart({
  points,
  competitorLabel,
}: {
  points: ChartPoint[];
  competitorLabel: string;
}) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);

  const n = points.length;
  if (n < 2) return null;

  // SVG layout constants
  const VW = 800;
  const VH = 290;
  const PL = 68;   // y-axis labels
  const PR = 110;  // end annotations
  const PT = 18;
  const PB = 30;   // x-axis labels
  const CW = VW - PL - PR;
  const CH = VH - PT - PB;
  const BASE = PT + CH;

  const maxComp = points[n - 1].competitor;
  const maxY = maxComp > 0 ? maxComp * 1.18 : 1;

  const xAt = (idx: number) => PL + (idx / (n - 1)) * CW;
  const yAt = (v: number) => PT + CH - (v / maxY) * CH;

  // SVG path strings
  const omniD  = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.omni)}`).join(' ');
  const compD  = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.competitor)}`).join(' ');

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

  // Y-axis ticks at 0%, 25%, 50%, 75%, 100%
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: maxY * f,
    y: yAt(maxY * f),
  }));

  // X-axis label indices: now, quarters, end
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

  // End annotations — enforce minimum vertical separation
  const yOmniEnd = yAt(points[n - 1].omni);
  const yCompEnd = yAt(points[n - 1].competitor);
  const sep = yOmniEnd - yCompEnd;
  const minSep = 38;
  const compAnnotY = sep < minSep ? yCompEnd - (minSep - sep) / 2 : yCompEnd;
  const omniAnnotY = sep < minSep ? yOmniEnd + (minSep - sep) / 2 : yOmniEnd;

  const bandW = CW / Math.max(n - 1, 1);

  function handleMouseEnter(e: React.MouseEvent<SVGRectElement>, i: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pixelsPerViewUnit = rect.width / VW;
    setTooltipLeft((xAt(i) - PL) * pixelsPerViewUnit);
    setHovered(i);
  }

  return (
    <div
      className="rounded-[14px] p-4 relative"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <LegendDot color="var(--color-state-speaking)" label="PyAI Omni" />
        <LegendDot color="var(--color-state-error)" label={`${competitorLabel} (est.)`} muted />
        <LegendDot color="#22c55e" label="Savings gap" fill />
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
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${uid}-omni`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((t) => (
            <line
              key={t.value}
              x1={PL}  y1={t.y}
              x2={VW - PR} y2={t.y}
              stroke="rgba(255,255,255,0.045)"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks
            .filter((t) => t.value > 0)
            .map((t) => (
              <text
                key={t.value}
                x={PL - 8}
                y={t.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="rgba(255,255,255,0.22)"
                fontFamily="ui-monospace,monospace"
              >
                {fmtAxis(t.value)}
              </text>
            ))}

          {/* X-axis labels */}
          {xLabelIndices.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={VH - 5}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.22)"
              fontFamily="ui-monospace,monospace"
            >
              {points[i].month === 0 ? 'now' : `mo ${points[i].month}`}
            </text>
          ))}

          {/* Omni area fill */}
          <path d={omniAreaD} fill={`url(#${uid}-omni)`} />

          {/* Savings gap fill */}
          <path d={gapD} fill={`url(#${uid}-gap)`} />

          {/* Competitor line */}
          <path
            d={compD}
            fill="none"
            stroke="var(--color-state-error)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.75"
          />

          {/* Omni line */}
          <path
            d={omniD}
            fill="none"
            stroke="var(--color-state-speaking)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* End annotation — competitor */}
          <g transform={`translate(${xAt(n - 1) + 10}, ${compAnnotY})`}>
            <text
              y="4"
              fontSize="12"
              fill="var(--color-state-error)"
              fontFamily="ui-monospace,monospace"
              fontWeight="600"
              opacity="0.9"
            >
              {fmtFull(points[n - 1].competitor)}
            </text>
            <text
              y="17"
              fontSize="9.5"
              fill="rgba(255,255,255,0.32)"
              fontFamily="ui-monospace,monospace"
            >
              {competitorLabel}
            </text>
          </g>

          {/* End annotation — PyAI Omni */}
          <g transform={`translate(${xAt(n - 1) + 10}, ${omniAnnotY})`}>
            <text
              y="4"
              fontSize="12"
              fill="var(--color-state-speaking)"
              fontFamily="ui-monospace,monospace"
              fontWeight="600"
            >
              {fmtFull(points[n - 1].omni)}
            </text>
            <text
              y="17"
              fontSize="9.5"
              fill="rgba(255,255,255,0.32)"
              fontFamily="ui-monospace,monospace"
            >
              PyAI Omni
            </text>
          </g>

          {/* Hover vertical guide */}
          {hovered !== null && hovered > 0 && (
            <line
              x1={xAt(hovered)}
              y1={PT}
              x2={xAt(hovered)}
              y2={BASE}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}

          {/* Hover dots */}
          {hovered !== null && hovered > 0 && (
            <>
              <circle
                cx={xAt(hovered)}
                cy={yAt(points[hovered].competitor)}
                r="4.5"
                fill="var(--color-state-error)"
                stroke="var(--color-surface-raised)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xAt(hovered)}
                cy={yAt(points[hovered].omni)}
                r="4.5"
                fill="var(--color-state-speaking)"
                stroke="var(--color-surface-raised)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {/* Invisible hover bands */}
          {points.map((_, i) => (
            <rect
              key={i}
              x={xAt(i) - bandW / 2}
              y={PT}
              width={bandW}
              height={CH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={(e) => handleMouseEnter(e, i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {/* HTML tooltip */}
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
            <TooltipRow
              dot="var(--color-state-error)"
              label={competitorLabel}
              value={fmtFull(points[hovered].competitor)}
            />
            <TooltipRow
              dot="var(--color-state-speaking)"
              label="PyAI Omni"
              value={fmtFull(points[hovered].omni)}
            />
            <div
              className="flex items-center justify-between gap-6 pt-1.5"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text-faint)' }}>Savings</span>
              <span
                className="font-mono font-[700]"
                style={{ color: 'var(--color-state-speaking)' }}
              >
                {fmtFull(
                  Math.max(0, points[hovered].competitor - points[hovered].omni),
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tooltip row ──────────────────────────────────────────────────────────────

function TooltipRow({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 justify-between">
      <div className="flex items-center gap-1.5">
        <span
          className="rounded-full shrink-0"
          style={{ width: 6, height: 6, background: dot }}
        />
        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <span
        className="font-mono font-[600] pl-4"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Legend dot ───────────────────────────────────────────────────────────────

function LegendDot({
  color,
  label,
  fill,
  muted,
}: {
  color: string;
  label: string;
  fill?: boolean;
  muted?: boolean;
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
          style={{
            width: 8,
            height: 8,
            background: color,
            opacity: muted ? 0.65 : 1,
            display: 'block',
          }}
        />
      )}
      <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
    </div>
  );
}
