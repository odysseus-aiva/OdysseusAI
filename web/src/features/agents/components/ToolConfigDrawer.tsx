'use client';

import { useMemo } from 'react';
import { Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Field';
import type { CatalogueTool } from '@/lib/api/agents';
import type { ToolDraft } from '../useAgentConfig';
import { categoryMeta } from '../tool-categories';

/** JSON Schema subset the catalogue emits for tool config. */
interface PropSchema {
  type?: string;
  enum?: string[];
  description?: string;
  default?: unknown;
}

/** Sample arguments per tool so "Run test" needs no manual input. */
const TEST_ARGS: Record<string, Record<string, unknown>> = {
  get_weather: { location: 'Noida', when: 'today' },
  web_search: { query: 'latest AI news' },
  get_current_datetime: { timezone: 'Asia/Kolkata' },
  end_call: { reason: 'User said goodbye' },
};

export function ToolConfigDrawer({
  tool,
  draft,
  open,
  onClose,
  onToggle,
  onConfigChange,
  onReset,
  onTest,
  testing,
  testResult,
}: {
  tool: CatalogueTool | null;
  draft: ToolDraft | undefined;
  open: boolean;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onConfigChange: (key: string, value: unknown) => void;
  onReset: () => void;
  onTest: (args: Record<string, unknown>) => void;
  testing: boolean;
  testResult?: string;
}) {
  const props = useMemo(() => {
    if (!tool) return {} as Record<string, PropSchema>;
    return (tool.configSchema.properties ?? {}) as Record<string, PropSchema>;
  }, [tool]);

  if (!tool) return null;

  const meta = categoryMeta(tool.category);
  const Icon = meta.icon;
  const enabled = draft?.enabled ?? false;
  const configKeys = Object.keys(props);
  const missingEnv = tool.requiredEnv.length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tool.displayName}
      width={480}
      subtitle={
        <span className="flex items-center gap-1.5">
          <Icon size={11} strokeWidth={2} style={{ color: meta.color }} />
          {meta.label}
          <span style={{ color: 'var(--color-border-strong)' }}>·</span>
          <span className="font-mono">{tool.name}</span>
        </span>
      }
      headerAction={
        <div className="flex flex-shrink-0 items-center gap-2 pt-0.5">
          <span
            className="text-[11px] font-[500]"
            style={{ color: enabled ? 'var(--color-accent)' : 'var(--color-text-faint)' }}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={enabled}
            onChange={onToggle}
            label={`${enabled ? 'Disable' : 'Enable'} ${tool.displayName}`}
            size="sm"
          />
        </div>
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onTest(TEST_ARGS[tool.name] ?? {})}
            loading={testing}
          >
            {!testing && <Play size={11} strokeWidth={2.5} />}
            Run test
          </Button>
          {configKeys.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw size={11} strokeWidth={2.2} />
              Reset defaults
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* What it does */}
        <p className="text-[12.5px] leading-[1.65]" style={{ color: 'var(--color-text-muted)' }}>
          {tool.description}
        </p>

        {/* Required environment */}
        {missingEnv && (
          <div
            className="flex items-start gap-2.5 rounded-[9px] px-3 py-2.5"
            style={{
              background: 'rgb(251 191 36 / 0.06)',
              border: '1px solid rgb(251 191 36 / 0.18)',
            }}
          >
            <TriangleAlert
              size={13}
              strokeWidth={2}
              className="mt-px flex-shrink-0"
              style={{ color: 'var(--color-state-warning)' }}
            />
            <div className="flex flex-col gap-1">
              <p
                className="text-[12px] font-[500]"
                style={{ color: 'var(--color-state-warning)' }}
              >
                Requires server configuration
              </p>
              <p className="text-[11.5px] leading-[1.55]" style={{ color: 'var(--color-text-muted)' }}>
                Set{' '}
                {tool.requiredEnv.map((env, i) => (
                  <span key={env}>
                    {i > 0 && ', '}
                    <code className="font-mono" style={{ color: 'var(--color-text)' }}>
                      {env}
                    </code>
                  </span>
                ))}{' '}
                in the server environment, or this tool fails at call time.
              </p>
            </div>
          </div>
        )}

        {/* Schema-driven configuration */}
        {configKeys.length > 0 ? (
          <div className="flex flex-col gap-4">
            <h3
              className="text-[11px] font-[600] uppercase tracking-[0.09em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Configuration
            </h3>
            {configKeys.map((key) => (
              <ConfigControl
                key={key}
                name={key}
                schema={props[key]}
                value={draft?.config?.[key]}
                onChange={(v) => onConfigChange(key, v)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
            This tool has no configurable options.
          </p>
        )}

        {/* Test output */}
        {testResult && (
          <div className="flex flex-col gap-2">
            <h3
              className="text-[11px] font-[600] uppercase tracking-[0.09em]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              Test result
            </h3>
            <pre
              className="max-h-[280px] overflow-auto rounded-[9px] px-3 py-2.5 font-mono text-[11.5px] leading-[1.6]"
              style={{
                background: 'var(--color-abyss)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {testResult}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** Renders the right control for one JSON Schema property. */
function ConfigControl({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: PropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = labelize(name);

  if (schema.type === 'boolean') {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
            {label}
          </span>
          {schema.description && (
            <span
              className="text-[11.5px] leading-[1.5]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              {schema.description}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 pt-0.5">
          <Switch checked={Boolean(value)} onChange={onChange} label={label} size="sm" />
        </div>
      </div>
    );
  }

  if (schema.enum) {
    return (
      <Field label={label} hint={schema.description}>
        <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (schema.type === 'array') {
    return (
      <Field label={label} hint={schema.description ?? 'Comma-separated values'}>
        <Input
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>
    );
  }

  const numeric = schema.type === 'integer' || schema.type === 'number';

  return (
    <Field label={label} hint={schema.description}>
      <Input
        type={numeric ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (!numeric) {
            onChange(raw);
            return;
          }
          // Preserve an empty field rather than coercing it to 0.
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    </Field>
  );
}

/** `forecastDays` → `Forecast days`; `speakDuringExecution` → `Speak during execution`. */
function labelize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
