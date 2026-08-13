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
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="flex flex-col items-center gap-5 text-center max-w-sm">
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 56,
              height: 56,
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Icon size={22} strokeWidth={1.5} style={{ color: 'var(--color-text-faint)' }} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-[500] tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
              We&apos;re working on this
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {detail ?? `${title} is coming soon. Check back in the next release.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
