import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

/** Test a custom HTTP tool definition before assigning it to an agent. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const upstream = await proxyToBackend('/agents/tools/custom/test', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}
