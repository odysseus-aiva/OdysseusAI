import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

export async function GET() {
  try {
    const upstream = await proxyToBackend('/agents');
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const upstream = await proxyToBackend('/agents', {
      method: 'POST',
      body: JSON.stringify(body),
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
