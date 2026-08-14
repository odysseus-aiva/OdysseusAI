import { Radio } from 'lucide-react';
import { ComingSoon } from '@/components/ui/ComingSoon';

export default function LiveCallsPage() {
  return (
    <ComingSoon
      title="Live calls"
      description="Monitor active voice sessions in real time."
      icon={Radio}
      detail="Watch active calls, listen in, and inspect live pipeline events as they happen — coming soon."
    />
  );
}
