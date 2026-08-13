import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { VoiceExperience } from '@/features/voice/components/VoiceExperience';

export default function Home() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <VoiceExperience />
      </Suspense>
    </AppShell>
  );
}
