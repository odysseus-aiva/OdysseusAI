import { proxyToBackend } from '@/lib/api/backend';
import type { NextRequest } from 'next/server';

// Forwards all query params (limit, offset, agentId, status, startAfter,
// startBefore, sortBy, order) to the backend as-is.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  const upstream = await proxyToBackend(`/call-logs${qs ? `?${qs}` : ''}`);
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
