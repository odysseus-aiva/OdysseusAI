/**
 * Centralized, validated environment access.
 * Server-only values live here and must never be imported into client
 * components (Next will error if they are). Public values are prefixed
 * NEXT_PUBLIC_ and safe to use anywhere.
 */

/** Server-only: base URL of the NestJS backend. */
export function getBackendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (!url) {
    throw new Error(
      'BACKEND_URL is not set. Copy .env.local.example to .env.local.',
    );
  }
  return url.replace(/\/$/, '');
}

/** Public: app display name. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Dhvani';
