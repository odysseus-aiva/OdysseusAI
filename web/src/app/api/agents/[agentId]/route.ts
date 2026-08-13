import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

type Params = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { agentId } = await params;
  try {
    const upstream = await proxyToBackend(`/agents/${encodeURIComponent(agentId)}`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { agentId } = await params;
  try {
    const body = await request.json();
    const upstream = await proxyToBackend(`/agents/${encodeURIComponent(agentId)}`, {
      method: 'PUT',
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

export async function DELETE(_request: Request, { params }: Params) {
  const { agentId } = await params;
  try {
    const upstream = await proxyToBackend(`/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    });
    const data = await upstream.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the backend.' },
      { status: 502 },
    );
  }
}
