import {
  CustomHttpToolDefinition,
  DEFAULT_TOOL_TIMEOUT_MS,
  MAX_TOOL_TIMEOUT_MS,
  SECRET_MASK,
} from './custom-tool.types';

// ─── Template interpolation ───────────────────────────────────────────────────

/** Replace `{{ key }}` / `{{ a.b }}` tokens with values from `vars`. */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = dotGet(vars, key);
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** Recursively interpolate string values inside an object/array template. */
export function interpolateDeep(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === 'string') return interpolate(value, vars);
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, vars));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateDeep(v, vars);
    }
    return out;
  }
  return value;
}

/** Read a dot-path (`a.b.0.c`) out of a nested object/array. */
export function dotGet(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

// ─── Argument validation (lightweight JSON Schema) ─────────────────────────────

/** Validate args against the tool's inputSchema. Returns an error string or null. */
export function validateArgs(
  args: Record<string, unknown>,
  schema?: Record<string, unknown>,
): string | null {
  if (!schema || typeof schema !== 'object') return null;

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return `Missing required argument: ${key}`;
    }
  }

  const props = (schema.properties ?? {}) as Record<
    string,
    { type?: string }
  >;
  for (const [key, value] of Object.entries(args)) {
    const prop = props[key];
    if (!prop?.type || value === undefined || value === null) continue;
    if (!matchesType(value, prop.type)) {
      return `Argument "${key}" must be of type ${prop.type}`;
    }
  }
  return null;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

// ─── SSRF protection ───────────────────────────────────────────────────────────

/**
 * Reject URLs that could reach internal infrastructure. Blocks non-http(s)
 * schemes, loopback/private/link-local/metadata hosts, and — when an allowlist
 * is configured — anything not on it.
 *
 * Note: this guards against the common cases (literal private IPs, localhost,
 * cloud metadata). It does not defeat DNS-rebinding; use the allowlist for
 * untrusted operators.
 */
export function assertUrlAllowed(rawUrl: string, allowedHosts: string[]): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (allowedHosts.length > 0) {
    const ok = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
    if (!ok) throw new Error(`Host "${host}" is not in the allowed-host list`);
    return;
  }

  if (isBlockedHost(host)) {
    throw new Error(`Host "${host}" is not allowed (private or reserved address)`);
  }
}

function isBlockedHost(host: string): boolean {
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::'
  ) {
    return true;
  }
  if (isIpv4(host)) return isPrivateIpv4(host);
  // IPv6 private ranges (unique-local fc00::/7, link-local fe80::/10).
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) {
    return true;
  }
  return false;
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.some((p) => p > 255)) return true; // malformed → block
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
    a === 0
  );
}

// ─── Secrets ────────────────────────────────────────────────────────────────────

/** Return a copy of the definition with all header values masked for display. */
export function maskDefinitionSecrets(
  def: CustomHttpToolDefinition,
): CustomHttpToolDefinition {
  if (!def.headers) return def;
  const headers: Record<string, string> = {};
  for (const key of Object.keys(def.headers)) {
    headers[key] = def.headers[key] ? SECRET_MASK : '';
  }
  return { ...def, headers };
}

/**
 * When saving, any header still equal to the mask keeps its previously stored
 * value (the UI never received the real secret, so it echoes the mask back).
 */
export function restoreMaskedSecrets(
  incoming: CustomHttpToolDefinition,
  existing?: CustomHttpToolDefinition,
): CustomHttpToolDefinition {
  if (!incoming.headers) return incoming;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming.headers)) {
    headers[key] =
      value === SECRET_MASK ? (existing?.headers?.[key] ?? '') : value;
  }
  return { ...incoming, headers };
}

// ─── Timeout ─────────────────────────────────────────────────────────────────

export function clampTimeout(timeoutMs?: number): number {
  const n = Number(timeoutMs);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TOOL_TIMEOUT_MS;
  return Math.min(Math.trunc(n), MAX_TOOL_TIMEOUT_MS);
}
