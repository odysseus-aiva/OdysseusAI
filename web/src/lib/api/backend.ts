import { getBackendUrl } from '@/lib/env';

export async function proxyToBackend(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}
