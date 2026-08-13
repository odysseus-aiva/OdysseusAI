import { Wrench } from 'lucide-react';
import { ComingSoon } from '@/components/ui/ComingSoon';

export default function ToolsPage() {
  return (
    <ComingSoon
      title="Tools"
      description="Manage and test the built-in tool catalogue."
      icon={Wrench}
      detail="A unified view of every tool available to your agents, with live test runners and usage stats — coming soon."
    />
  );
}
