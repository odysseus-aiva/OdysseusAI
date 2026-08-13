import { proxyToBackend } from '@/lib/api/backend';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;

  // Forward Range header so the backend can respond with 206 Partial Content,
  // enabling the browser's audio element to seek to arbitrary positions.
  const rangeHeader = req.headers.get('range');
  const extraHeaders: Record<string, string> = {};
  if (rangeHeader) extraHeaders['Range'] = rangeHeader;

  const upstream = await proxyToBackend(
    `/call-logs/${encodeURIComponent(callId)}/recording`,
    { headers: extraHeaders },
  );

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers['Content-Range'] = contentRange;

  return new Response(upstream.body, { status: upstream.status, headers });
}
