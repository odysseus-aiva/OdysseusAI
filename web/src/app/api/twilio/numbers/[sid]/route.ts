import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  try {
    const { sid } = await params;
    const upstream = await proxyToBackend(`/twilio/numbers/${encodeURIComponent(sid)}`, {
      method: 'DELETE',
    });
    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the backend.' }, { status: 502 });
  }
}
