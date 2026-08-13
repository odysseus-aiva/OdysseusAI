import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/env';
import { sessionConnectionSchema } from '@/lib/api/session';

/**
 * Backend-for-frontend proxy. The browser calls this same-origin route; the
 * real backend URL and any future auth headers stay server-side. Returns the
 * validated connection envelope the LiveKit client needs.
 */
export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is valid — agentConfig is optional.
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendUrl()}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the voice service.' },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'The voice service rejected the request.' },
      { status: upstream.status },
    );
  }

  const parsed = sessionConnectionSchema.safeParse(await upstream.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Malformed response from the voice service.' },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed.data);
}
