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
        <span className="flex items-center gap-2">
          <Icon size={14} strokeWidth={2} aria-hidden="true" style={{ color: meta.color }} />
          {meta.label}
          <span aria-hidden style={{ color: 'var(--fg-muted)' }}>
            ·
          </span>
          <span className="font-mono">{tool.name}</span>
        </span>
      }
      headerAction={
        <div className="flex flex-shrink-0 items-center gap-2">
          <span
            className="text-caption"
            style={{ color: enabled ? 'var(--fg-ink)' : 'var(--fg-muted)' }}
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
            {!testing && <Play size={16} strokeWidth={2} aria-hidden="true" />}
            Run test
          </Button>
          {configKeys.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
              Reset defaults
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* What it does */}
        <p className="text-caption leading-body" style={{ color: 'var(--fg-body)' }}>
          {tool.description}
        </p>

        {/* A missing key is a prerequisite the operator has to satisfy, not a
            state of this call — so the callout is chrome, and chrome is grey. */}
        {missingEnv && (
          <div
            className="flex items-start gap-3 rounded-md p-3"
            style={{
              background: 'var(--surface-recessed)',
              border: '1px solid var(--line-hairline)',
            }}
          >
            <TriangleAlert
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-px flex-shrink-0"
              style={{ color: 'var(--fg-muted)' }}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-caption font-medium" style={{ color: 'var(--fg-ink)' }}>
                Requires server configuration
              </p>
              <p className="text-caption leading-body" style={{ color: 'var(--fg-body)' }}>
                Set{' '}
                {tool.requiredEnv.map((env, i) => (
                  <span key={env}>
                    {i > 0 && ', '}
                    <code className="font-mono" style={{ color: 'var(--fg-ink)' }}>
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
            <h3 className="section__title">Configuration</h3>
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
          <p className="text-caption" style={{ color: 'var(--fg-muted)' }}>
            This tool has no configurable options.
          </p>
        )}

        {/* Test output */}
        {testResult && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <h3 className="section__title">Test result</h3>
            <pre className="code-block max-h-[280px] whitespace-pre-wrap">{testResult}</pre>
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
          <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
            {label}
          </span>
          {schema.description && (
            <span className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
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
        <Select
          aria-label={label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
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
          aria-label={label}
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
        aria-label={label}
        type={numeric ? 'number' : 'text'}
        inputMode={numeric ? 'numeric' : undefined}
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
