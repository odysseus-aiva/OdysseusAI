import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

type Params = { params: Promise<{ suggestionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { suggestionId } = await params;
  try {
    const body = await request.json();
    const upstream = await proxyToBackend(
      `/suggestions/${encodeURIComponent(suggestionId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the backend.' }, { status: 502 });
  }
}
