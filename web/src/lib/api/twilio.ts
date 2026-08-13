import { z } from 'zod';

export const availableNumberSchema = z.object({
  friendlyName: z.string(),
  phoneNumber: z.string(),
  locality: z.string(),
  region: z.string(),
  isoCountry: z.string(),
  monthlyPrice: z.string().optional(),
  capabilities: z.object({
    voice: z.boolean(),
    sms: z.boolean(),
  }),
});

export const ownedNumberSchema = z.object({
  sid: z.string(),
  friendlyName: z.string(),
  phoneNumber: z.string(),
  dateCreated: z.string(),
  capabilities: z.object({
    voice: z.boolean(),
    sms: z.boolean(),
  }),
});

export type AvailableNumber = z.infer<typeof availableNumberSchema>;
export type OwnedNumber = z.infer<typeof ownedNumberSchema>;

export async function searchAvailableNumbers(
  country: string,
  areaCode?: string,
): Promise<AvailableNumber[]> {
  const params = new URLSearchParams({ country });
  if (areaCode) params.set('areaCode', areaCode);
  const res = await fetch(`/api/twilio/numbers/available?${params.toString()}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? 'Failed to search numbers');
  }
  return z.array(availableNumberSchema).parse(await res.json());
}

export async function listOwnedNumbers(): Promise<OwnedNumber[]> {
  const res = await fetch('/api/twilio/numbers/owned');
  if (!res.ok) throw new Error('Failed to load owned numbers');
  return z.array(ownedNumberSchema).parse(await res.json());
}

export async function purchaseNumber(
  phoneNumber: string,
): Promise<{ sid: string; phoneNumber: string }> {
  const res = await fetch('/api/twilio/numbers/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(err?.message)
      ? err.message.join(', ')
      : err?.message ?? 'Failed to purchase number';
    throw new Error(message);
  }
  return res.json() as Promise<{ sid: string; phoneNumber: string }>;
}

export async function releaseNumber(sid: string): Promise<void> {
  const res = await fetch(`/api/twilio/numbers/${encodeURIComponent(sid)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) throw new Error('Failed to release number');
}
