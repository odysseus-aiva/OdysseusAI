import { proxyToBackend } from '@/lib/api/backend';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const upstream = await proxyToBackend(
    `/call-logs/${encodeURIComponent(callId)}/transcript`,
  );
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
