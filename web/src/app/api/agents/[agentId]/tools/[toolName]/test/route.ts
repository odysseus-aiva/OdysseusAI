import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

type Params = { params: Promise<{ agentId: string; toolName: string }> };

export async function POST(request: Request, { params }: Params) {
  const { agentId, toolName } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const upstream = await proxyToBackend(
      `/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}/test`,
      {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      },
    );
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}
