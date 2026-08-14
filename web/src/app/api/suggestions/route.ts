import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  try {
    const upstream = await proxyToBackend(`/suggestions${qs ? `?${qs}` : ''}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the backend.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const upstream = await proxyToBackend('/suggestions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the backend.' }, { status: 502 });
  }
}
