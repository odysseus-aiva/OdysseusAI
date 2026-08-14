import { type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';

interface ComingSoonProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  detail?: string;
}

export function ComingSoon({ title, description, icon: Icon, detail }: ComingSoonProps) {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title={title} description={description} />
      {/* Bare rather than boxed: the page header already frames this, and a
          container would float in the middle of an otherwise empty canvas.
          Title and body are the same 15px — hierarchy is weight and colour. */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="empty-state empty-state--bare">
          <span className="empty-state__tile" aria-hidden="true">
            <Icon size={20} strokeWidth={1.7} />
          </span>
          <h2 className="empty-state__title">We&apos;re working on this</h2>
          <p className="empty-state__body">
            {detail ?? `${title} is coming soon. Check back in the next release.`}
          </p>
        </div>
      </div>
    </div>
  );
}
