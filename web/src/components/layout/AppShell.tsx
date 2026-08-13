'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Mic2,
  LayoutDashboard,
  Bot,
  PhoneCall,
  Radio,
  Wrench,
  BarChart3,
  Settings,
  ChevronRight,
} from 'lucide-react';

const NAV_SECTIONS = [
  { href: '/', icon: Mic2, label: 'Voice', exact: true },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agents', icon: Bot, label: 'Agents' },
  { href: '/calls', icon: PhoneCall, label: 'Call History' },
  { href: '/live', icon: Radio, label: 'Live Calls' },
  { href: '/tools', icon: Wrench, label: 'Tools' },
  { href: '/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const;

function NavItem({
  href,
  icon: Icon,
  label,
  exact,
  index,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  index: number;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.38, delay: 0.06 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={href}
        title={label}
        className="group relative flex items-center gap-3 rounded-[8px] px-3 py-[7px] max-lg:justify-center max-lg:px-0"
        style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      >
        {/* Shared layout animation for active pill */}
        {active && (
          <motion.div
            layoutId="nav-pill"
            className="absolute inset-0 rounded-[8px]"
            style={{
              background: 'rgb(56 232 255 / 0.06)',
              border: '1px solid rgb(56 232 255 / 0.13)',
              boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
            }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* Hover surface — no layout animation so it's always instant */}
        <span
          className="absolute inset-0 rounded-[8px] opacity-0 group-hover:opacity-100 transition-opacity duration-[140ms] pointer-events-none"
          style={{ background: 'rgb(255 255 255 / 0.035)' }}
        />

        <span className="relative z-10 flex-shrink-0 transition-colors duration-[140ms]">
          <Icon
            size={15}
            strokeWidth={active ? 2.2 : 1.75}
            style={{ color: active ? 'var(--color-accent)' : undefined }}
          />
        </span>

        <span
          className="relative z-10 text-[13px] font-[450] leading-none tracking-[-0.01em] transition-colors duration-[140ms] group-hover:text-[--color-text] max-lg:hidden"
          style={{ color: active ? 'var(--color-accent)' : undefined }}
        >
          {label}
        </span>

        {/* Active left accent stripe */}
        {active && (
          <motion.span
            layoutId="nav-stripe"
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 2.5,
              height: 16,
              background: 'var(--color-accent)',
              boxShadow: '0 0 8px var(--color-accent)',
            }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </Link>
    </motion.div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-10 flex [--sidebar-w:var(--width-sidebar-rail)] lg:[--sidebar-w:var(--width-sidebar-full)]"
    >
      {/* Sidebar */}
      <motion.aside
        className="relative flex h-full flex-shrink-0 flex-col"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          // Collapses to an icon rail below `lg` so narrow viewports keep a
          // usable content column.
          width: 'var(--sidebar-w)',
          background: 'var(--color-sidebar)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* Top accent hairline — a thin horizontal glow at the very top */}
        <div
          className="absolute top-0 left-4 right-4 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgb(56 232 255 / 0.25) 40%, rgb(56 232 255 / 0.25) 60%, transparent)',
          }}
        />

        {/* Sidebar ambient fill — mirrors the orb's energy field */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 110% 35% at 50% 0%, rgb(56 232 255 / 0.045), transparent 65%)',
          }}
        />

        {/* Logo */}
        <motion.div
          className="flex items-center gap-2.5 px-4 pb-5 pt-5 max-lg:justify-center max-lg:px-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
        >
          <div
            className="relative flex items-center justify-center rounded-[9px] flex-shrink-0"
            style={{
              width: 30,
              height: 30,
              background: 'linear-gradient(145deg, rgb(56 232 255 / 0.12), rgb(56 232 255 / 0.04))',
              border: '1px solid rgb(56 232 255 / 0.22)',
              boxShadow: '0 0 12px rgb(56 232 255 / 0.15)',
            }}
          >
            <Mic2 size={13} color="var(--color-accent)" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col gap-0 max-lg:hidden">
            <span
              className="text-[13.5px] font-[650] tracking-[-0.03em] leading-none"
              style={{ color: 'var(--color-text)' }}
            >
              Odysseus
            </span>
            <span
              className="text-[10px] font-[450] tracking-[0.06em] leading-none mt-[3px]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              VOICE AI
            </span>
          </div>
        </motion.div>

        {/* Nav section label */}
        <motion.div
          className="px-3 pb-1.5 max-lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.14 }}
        >
          <span
            className="text-[10px] font-[600] uppercase tracking-[0.1em] px-2"
            style={{ color: 'var(--color-text-faint)' }}
          >
            Platform
          </span>
        </motion.div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 max-lg:px-1.5">
          {NAV_SECTIONS.map((item, i) => (
            <NavItem key={item.href} {...item} index={i} />
          ))}
        </nav>

        {/* Footer */}
        <motion.div
          className="px-3 py-3 border-t"
          style={{ borderColor: 'var(--color-border)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
        >
          <div className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 max-lg:justify-center max-lg:px-0">
            <div
              className="flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-[700]"
              style={{
                width: 22,
                height: 22,
                background: 'linear-gradient(135deg, var(--color-surface-elevated), var(--color-surface-raised))',
                border: '1px solid var(--color-border-strong)',
                color: 'var(--color-text-faint)',
              }}
            >
              v1
            </div>
            <span
              className="text-[11.5px] font-[450] max-lg:hidden"
              style={{ color: 'var(--color-text-faint)' }}
            >
              v0.1.0
            </span>
          </div>
        </motion.div>
      </motion.aside>

      {/* Main scroll container */}
      <main
        className="relative flex-1 h-full overflow-y-auto overflow-x-hidden"
        style={{ background: 'var(--color-void)' }}
      >
        {children}
      </main>
    </div>
  );
}

/* ── Breadcrumb ── */
export function PageBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronRight size={10} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="text-[12px] font-[450] hover:text-[--color-text] transition-colors duration-[140ms]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[12px] font-[450]" style={{ color: 'var(--color-text)' }}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ── Page header ── */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <motion.header
      className="flex items-start justify-between gap-6 px-8 pt-7 pb-5"
      style={{ borderBottom: '1px solid var(--color-border)' }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex flex-col gap-1.5">
        {breadcrumb && <PageBreadcrumb items={breadcrumb} />}
        <h1
          className="text-[22px] font-[600] tracking-[-0.035em] leading-tight"
          style={{ color: 'var(--color-text)' }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="text-[13px] font-[400] leading-snug"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">{actions}</div>
      )}
    </motion.header>
  );
}
