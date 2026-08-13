import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    if (searchParams.get('country')) params.set('country', searchParams.get('country')!);
    if (searchParams.get('areaCode')) params.set('areaCode', searchParams.get('areaCode')!);
    const upstream = await proxyToBackend(`/twilio/numbers/available?${params.toString()}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the backend.' }, { status: 502 });
  }
}
