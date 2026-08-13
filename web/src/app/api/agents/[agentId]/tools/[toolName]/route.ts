import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api/backend';

type Params = { params: Promise<{ agentId: string; toolName: string }> };

/** Remove a single tool assignment (used to delete custom functions). */
export async function DELETE(_request: Request, { params }: Params) {
  const { agentId, toolName } = await params;
  try {
    const upstream = await proxyToBackend(
      `/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}`,
      { method: 'DELETE' },
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
