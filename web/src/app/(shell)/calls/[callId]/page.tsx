'use client';

import { useParams } from 'next/navigation';
import { CallDetailView } from '@/features/calls/detail/CallDetailView';

export default function CallDetailPage() {
  const params = useParams<{ callId: string }>();
  const callId = decodeURIComponent(params.callId);
  return <CallDetailView callId={callId} />;
}
