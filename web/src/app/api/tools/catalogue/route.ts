import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

export async function GET() {
  try {
    const upstream = await proxyToBackend('/tools/catalogue');
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}
