'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Play, Loader2 } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select, Switch } from '@/components/ui/Field';
import {
  CUSTOM_TOOL_KIND,
  SECRET_MASK,
  type CustomToolDefinition,
  type CustomToolHttpMethod,
} from '@/lib/api/agents';
import type { CustomToolEntry } from '../useAgentConfig';

const METHODS: CustomToolHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

type Row = { key: string; value: string };

function objToRows(obj?: Record<string, string>): Row[] {
  return obj ? Object.entries(obj).map(([key, value]) => ({ key, value })) : [];
}
function rowsToObj(rows: Row[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) if (key.trim()) out[key.trim()] = value;
  return Object.keys(out).length ? out : undefined;
}
function pretty(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/**
 * Create / edit a Custom Function (HTTP API tool). Configures the request, the
 * input schema the model must fill, response mapping, and how the agent should
 * speak the result — and can test the call before it is assigned.
 */
export function CustomToolBuilder({
  open,
  initial,
  existingNames,
  onClose,
  onSave,
  onTest,
  testing,
  testResults,
}: {
  open: boolean;
  /** Existing entry when editing; undefined when creating. */
  initial?: CustomToolEntry;
  /** Names already in use (to prevent duplicates when creating). */
  existingNames: string[];
  onClose: () => void;
  onSave: (entry: CustomToolEntry) => void;
  onTest: (key: string, def: CustomToolDefinition, args: Record<string, unknown>) => void;
  testing: string | null;
  testResults: Record<string, string>;
}) {
  const editing = !!initial;
  const def = initial?.def;

  const [name, setName] = useState(initial?.toolName ?? '');
  const [description, setDescription] = useState(def?.description ?? '');
  const [method, setMethod] = useState<CustomToolHttpMethod>(def?.method ?? 'GET');
  const [url, setUrl] = useState(def?.url ?? '');
  const [headers, setHeaders] = useState<Row[]>(objToRows(def?.headers));
  const [query, setQuery] = useState<Row[]>(objToRows(def?.queryParams));
  const [mapping, setMapping] = useState<Row[]>(objToRows(def?.responseMapping));
  const [bodyText, setBodyText] = useState(pretty(def?.bodyTemplate));
  const [schemaText, setSchemaText] = useState(
    pretty(def?.inputSchema ?? { type: 'object', properties: {}, required: [] }),
  );
  const [timeoutMs, setTimeoutMs] = useState(String(def?.timeoutMs ?? 10000));
  const [resultInstruction, setResultInstruction] = useState(def?.resultInstruction ?? '');
  const [speak, setSpeak] = useState(def?.speakDuringExecution ?? false);
  const [executionMessage, setExecutionMessage] = useState(def?.executionMessage ?? '');
  const [argsText, setArgsText] = useState('{}');
  const [formError, setFormError] = useState<string | null>(null);

  const bodyAllowed = method !== 'GET' && method !== 'DELETE';
  // Test results are keyed by the tool name (or a placeholder while unnamed).
  const testKey = name.trim() || 'preview_tool';
  const isTesting = testing === testKey;
  const testResult = testResults[testKey];

  const nameError = useMemo(() => {
    if (!name) return undefined;
    if (!NAME_RE.test(name)) return 'Letters, numbers, underscore; must start with a letter';
    if (!editing && existingNames.includes(name)) return 'A tool with this name already exists';
    return undefined;
  }, [name, editing, existingNames]);

  function buildDefinition(): CustomToolDefinition {
    let inputSchema: Record<string, unknown> | undefined;
    if (schemaText.trim()) inputSchema = JSON.parse(schemaText) as Record<string, unknown>;

    let bodyTemplate: unknown;
    if (bodyAllowed && bodyText.trim()) {
      try {
        bodyTemplate = JSON.parse(bodyText);
      } catch {
        bodyTemplate = bodyText; // allow a raw templated string body
      }
    }

    return {
      kind: CUSTOM_TOOL_KIND,
      description: description.trim(),
      method,
      url: url.trim(),
      headers: rowsToObj(headers),
      queryParams: rowsToObj(query),
      bodyTemplate,
      inputSchema: inputSchema ?? { type: 'object', properties: {} },
      timeoutMs: Number(timeoutMs) || 10000,
      responseMapping: rowsToObj(mapping),
      resultInstruction: resultInstruction.trim() || undefined,
      speakDuringExecution: speak,
      executionMessage: executionMessage || undefined,
    };
  }

  function validate(): CustomToolDefinition | null {
    setFormError(null);
    if (!NAME_RE.test(name)) return fail('A valid tool name is required');
    if (!editing && existingNames.includes(name)) return fail('Tool name already in use');
    if (!description.trim()) return fail('Description is required — the model relies on it');
    if (!/^https?:\/\//i.test(url.trim())) return fail('URL must be an absolute http(s) URL');
    try {
      return buildDefinition();
    } catch {
      return fail('Input schema / body must be valid JSON');
    }
  }

  function fail(message: string): null {
    setFormError(message);
    return null;
  }

  function handleSave() {
    const built = validate();
    if (!built) return;
    onSave({ toolName: name, enabled: initial?.enabled ?? true, def: built });
    onClose();
  }

  function handleTest() {
    const built = validate();
    if (!built) return;
    let args: Record<string, unknown> = {};
    try {
      args = argsText.trim() ? (JSON.parse(argsText) as Record<string, unknown>) : {};
    } catch {
      setFormError('Test arguments must be valid JSON');
      return;
    }
    onTest(testKey, built, args);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${initial?.toolName}` : 'New custom function'}
      subtitle="Call any HTTP API — the agent invokes it automatically during a call"
      width={560}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Play size={13} strokeWidth={2} />
              )}
              Test
            </Button>
            <Button size="sm" onClick={handleSave}>
              {editing ? 'Save changes' : 'Add function'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Function name" hint="How the model refers to the tool" error={nameError}>
            <Input
              value={name}
              disabled={editing}
              placeholder="lookup_customer"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Timeout (ms)" hint="Max 30000">
            <Input
              type="number"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Description (shown to the model)">
          <Textarea
            rows={2}
            value={description}
            placeholder="Look up a customer by name and return their account details."
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as CustomToolHttpMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="URL" hint="Use {{arg}} to insert argument values">
            <Input
              value={url}
              placeholder="https://api.example.com/customers/{{id}}"
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
        </div>

        <KeyValueEditor
          label="Headers"
          hint="Values are stored as secrets and masked after saving"
          rows={headers}
          onChange={setHeaders}
          valuePlaceholder="Bearer {{token}}"
          secret
        />

        <KeyValueEditor
          label="Query parameters"
          rows={query}
          onChange={setQuery}
          valuePlaceholder="{{city}}"
        />

        {bodyAllowed && (
          <Field label="Request body template (JSON)" hint="{{arg}} placeholders are interpolated">
            <Textarea
              rows={4}
              value={bodyText}
              placeholder={'{\n  "query": "{{q}}"\n}'}
              onChange={(e) => setBodyText(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        )}

        <Field label="Input schema (JSON Schema)" hint="Arguments the model must produce">
          <Textarea
            rows={6}
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Field>

        <KeyValueEditor
          label="Response mapping"
          hint="Output key → dot-path into the JSON response (e.g. data.0.temp)"
          rows={mapping}
          onChange={setMapping}
          keyPlaceholder="temperature"
          valuePlaceholder="current.temperature_2m"
        />

        <Field label="How the agent should use the result" hint="Optional guidance appended to the tool output">
          <Textarea
            rows={2}
            value={resultInstruction}
            placeholder="Tell the caller the temperature in a friendly sentence."
            onChange={(e) => setResultInstruction(e.target.value)}
          />
        </Field>

        <div
          className="flex flex-col gap-3 rounded-[10px] p-3"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
        >
          <Switch
            checked={speak}
            onChange={setSpeak}
            label="Speak a message while this tool runs"
            size="sm"
          />
          {speak && (
            <Field label="Message spoken while running">
              <Input
                value={executionMessage}
                placeholder="One moment, let me look that up."
                onChange={(e) => setExecutionMessage(e.target.value)}
              />
            </Field>
          )}
        </div>

        {/* Test harness */}
        <div className="flex flex-col gap-2 pt-1">
          <Field label="Test arguments (JSON)" hint="Sent as the tool's input when you press Test">
            <Textarea
              rows={3}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          {testResult && (
            <pre
              className="max-h-64 overflow-auto rounded-[8px] p-3 text-[11.5px]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {testResult}
            </pre>
          )}
        </div>

        {formError && (
          <p className="text-[12px]" style={{ color: 'var(--color-state-error)' }}>
            {formError}
          </p>
        )}
        {headers.some((h) => h.value === SECRET_MASK) && (
          <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
            Masked header values are kept as-is unless you replace them.
          </p>
        )}
      </div>
    </Drawer>
  );
}

function KeyValueEditor({
  label,
  hint,
  rows,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
  secret = false,
}: {
  label: string;
  hint?: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  secret?: boolean;
}) {
  const update = (i: number, patch: Partial<Row>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={row.key}
              placeholder={keyPlaceholder}
              onChange={(e) => update(i, { key: e.target.value })}
            />
            <Input
              value={row.value}
              type={secret ? 'password' : 'text'}
              placeholder={valuePlaceholder}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <button
              type="button"
              aria-label="Remove row"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="flex flex-shrink-0 items-center justify-center rounded-[6px]"
              style={{ width: 30, height: 30, color: 'var(--color-text-faint)' }}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, { key: '', value: '' }])}
          className="flex items-center gap-1.5 self-start rounded-[7px] px-2 py-1 text-[12px]"
          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
        >
          <Plus size={12} strokeWidth={2.2} />
          Add
        </button>
      </div>
    </Field>
  );
}
