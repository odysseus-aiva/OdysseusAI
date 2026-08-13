import { proxyToBackend } from '@/lib/api/backend';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const upstream = await proxyToBackend(
    `/call-logs/${encodeURIComponent(callId)}/recording`,
  );

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'audio/wav',
    'Cache-Control': 'no-store',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
