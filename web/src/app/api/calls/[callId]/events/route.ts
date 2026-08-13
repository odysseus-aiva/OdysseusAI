import { proxyToBackend } from '@/lib/api/backend';
import type { NextRequest } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  const upstream = await proxyToBackend(
    `/call-logs/${encodeURIComponent(callId)}/events${qs ? `?${qs}` : ''}`,
  );
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
