import { Settings } from 'lucide-react';
import { ComingSoon } from '@/components/ui/ComingSoon';

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Platform configuration, API keys, and integrations."
      icon={Settings}
      detail="LLM provider selection, STT/TTS configuration, webhook endpoints, and team settings — coming soon."
    />
  );
}
