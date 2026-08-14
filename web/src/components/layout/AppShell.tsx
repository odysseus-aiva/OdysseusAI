'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Mic2,
  LayoutDashboard,
  Bot,
  PhoneCall,
  BarChart3,
  Settings,
  ChevronRight,
  Sun,
  Moon,
  Phone,
  PiggyBank,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useVoiceStore } from '@/features/voice/state/voice.store';
import { APP_NAME } from '@/lib/env';

function NavItem({
  href,
  icon: Icon,
  label,
  exact,
  index,
  rail,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  index: number;
  rail: boolean;
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
        className={`group relative flex items-center gap-3 rounded-[8px] py-[7px] ${
          rail
            ? 'justify-center px-0'
            : 'px-3 max-lg:justify-center max-lg:px-0'
        }`}
        style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      >
        {active && (
          <motion.div
            layoutId="nav-pill"
            className="absolute inset-0 rounded-[8px]"
            style={{
              background: 'var(--color-nav-active-bg)',
              border: '1px solid var(--color-accent-hairline)',
            }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* A hardcoded white veil vanishes on a white canvas — the hover wash
            has to come from a token so it inverts with the theme. */}
        <span
          className="absolute inset-0 rounded-[8px] opacity-0 group-hover:opacity-100 transition-opacity duration-[140ms] pointer-events-none"
          style={{ background: 'var(--surface-hover)' }}
        />

        <span className="relative z-10 flex-shrink-0 transition-colors duration-[140ms]">
          <Icon
            size={15}
            strokeWidth={active ? 2.2 : 1.75}
            style={{ color: active ? 'var(--color-accent)' : undefined }}
          />
        </span>

        {!rail && (
          <span
            className="relative z-10 text-[13px] font-[450] leading-none tracking-[-0.01em] transition-colors duration-[140ms] group-hover:text-(--color-text) max-lg:hidden"
            style={{ color: active ? 'var(--color-accent)' : undefined }}
          >
            {label}
          </span>
        )}

        {active && (
          <motion.span
            layoutId="nav-stripe"
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 2.5, height: 16, background: 'var(--color-accent)' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </Link>
    </motion.div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const phase = useVoiceStore((s) => s.phase);
  // Icon rail during an active / connecting call — expands again on idle/error.
  const callRail = phase === 'requesting' || phase === 'connected';

  return (
    <div
      className={`fixed inset-0 z-10 flex ${
        callRail
          ? '[--sidebar-w:var(--width-sidebar-rail)]'
          : '[--sidebar-w:var(--width-sidebar-rail)] lg:[--sidebar-w:var(--width-sidebar-full)]'
      }`}
    >
      {/* Sidebar — full labels on lg+, icon rail when narrow or mid-call */}
      <motion.aside
        className="relative flex h-full flex-shrink-0 flex-col overflow-hidden"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--color-sidebar)',
          borderRight: '1px solid var(--color-border)',
        }}
        data-rail={callRail ? 'true' : undefined}
        aria-label={callRail ? 'Platform navigation (collapsed)' : 'Platform navigation'}
      >
        <div
          className="absolute top-0 left-4 right-4 h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-accent-border) 40%, var(--color-accent-border) 60%, transparent)',
          }}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 110% 35% at 50% 0%, var(--color-accent-subtle), transparent 65%)',
          }}
        />

        {/* Header — logo left, theme toggle right */}
        <motion.div
          className={`flex items-center gap-2 pb-5 pt-5 ${
            callRail ? 'justify-center px-0' : 'px-4 max-lg:justify-center max-lg:px-0'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
        >
          <Image
            src="/dhvani-logo.png"
            alt={`${APP_NAME} logo`}
            width={18}
            height={18}
            className="flex-shrink-0 object-contain"
            priority
          />
          {!callRail && (
            <span
              className="flex-1 text-[13.5px] font-[650] tracking-[-0.03em] leading-none max-lg:hidden"
              style={{ color: 'var(--color-text)' }}
            >
              {APP_NAME}
            </span>
          )}
          {/* Theme toggle — top-right of sidebar header (desktop) */}
          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className={`flex-shrink-0 flex items-center justify-center rounded-[7px] transition-colors duration-[140ms] ${
              callRail ? '' : 'max-lg:hidden'
            }`}
            style={{ width: 26, height: 26, color: 'var(--color-text-faint)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-raised)';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-faint)';
            }}
          >
            {theme === 'dark' ? (
              <Sun size={13} strokeWidth={2} />
            ) : (
              <Moon size={13} strokeWidth={2} />
            )}
          </button>
          {/* Theme toggle — mobile (< lg) */}
          {!callRail && (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="lg:hidden flex-shrink-0 flex items-center justify-center rounded-[7px] transition-colors duration-[140ms]"
              style={{ width: 26, height: 26, color: 'var(--color-text-faint)' }}
            >
              {theme === 'dark' ? (
                <Sun size={13} strokeWidth={2} />
              ) : (
                <Moon size={13} strokeWidth={2} />
              )}
            </button>
          )}
        </motion.div>

        {/* Nav — grouped: Voice Console / Platform items / Settings */}
        <nav
          className={`flex flex-1 flex-col gap-0.5 overflow-y-auto ${
            callRail ? 'px-1.5' : 'px-2 max-lg:px-1.5'
          }`}
          aria-label="Major sections"
        >
          {/* Voice Console — top-of-nav, visually distinct */}
          <NavItem href="/" icon={Mic2} label="Voice Console" exact index={0} rail={callRail} />

          {/* Divider */}
          {!callRail && (
            <motion.div
              className="mx-1 my-1.5 max-lg:hidden"
              style={{ height: 1, background: 'var(--color-border)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.14 }}
            />
          )}

          {/* Platform section label */}
          {!callRail && (
            <motion.div
              className="px-3 pb-1 max-lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.14 }}
            >
              <span
                className="text-[10px] font-[600] uppercase tracking-[0.1em]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Platform
              </span>
            </motion.div>
          )}

          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" index={1} rail={callRail} />
          <NavItem href="/agents" icon={Bot} label="Agents" index={2} rail={callRail} />
          <NavItem href="/phone-numbers" icon={Phone} label="Phone Numbers" index={3} rail={callRail} />
          <NavItem href="/calls" icon={PhoneCall} label="Calls" index={4} rail={callRail} />
          <NavItem href="/analytics" icon={BarChart3} label="Analytics" index={5} rail={callRail} />
          <NavItem href="/savings" icon={PiggyBank} label="Cost & Savings" index={6} rail={callRail} />
        </nav>

        {/* Settings — pinned outside the nav so overflow-y-auto never clips it.
            height + box-sizing keeps the border-top on the same Y as the pagination footer. */}
        <div
          className={`flex-shrink-0 flex items-center ${callRail ? 'px-1.5' : 'px-2 max-lg:px-1.5'}`}
          style={{
            height: 48,
            boxSizing: 'border-box',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <NavItem href="/settings" icon={Settings} label="Settings" index={7} rail={callRail} />
        </div>

      </motion.aside>

      <main
        className="relative flex-1 h-full overflow-y-auto overflow-x-hidden"
        style={{ background: 'var(--color-void)' }}
      >
        {children}
      </main>
    </div>
  );
}

/* ── Breadcrumb ──
   A dim parent, a chevron, and a current crumb that is deliberately *not* a
   link and carries no affordance — that inertness is what tells the reader
   where they already are. Marked up as an ordered list so a screen reader
   announces the depth. */
export function PageBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const last = items.length - 1;

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={item.label}>
            {i > 0 && (
              <ChevronRight className="crumbs__sep" size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            {item.href && i !== last ? (
              <Link href={item.href} className="crumbs__link">
                {item.label}
              </Link>
            ) : (
              <span className="crumbs__current" aria-current={i === last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ── Page header ── */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  compact = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  /** Tighter header for nested detail workspaces. */
  compact?: boolean;
}) {
  return (
    /* No divider under the header: the title runs straight into the content,
       and where a tab strip follows, that strip's own hairline closes the
       block. Two rules 40px apart is the thing to avoid.

       Opacity and translate only — animating height or padding would reflow
       every page on mount. */
    <motion.header
      className="page__header"
      style={
        compact ? { padding: 'var(--space-4) var(--space-6) var(--space-3)' } : undefined
      }
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex min-w-0 flex-col" style={{ gap: 'var(--space-1)' }}>
        {breadcrumb && <PageBreadcrumb items={breadcrumb} />}
        {/* Inter 500, not the 300 display face: Space Grotesk stands in for
            Waldenburg and is licensed for the 48px voice headline alone. Using
            it on a page title imports the marketing system. */}
        <h1
          className="page__title"
          style={compact ? { fontSize: 'var(--text-title-md)' } : undefined}
        >
          {title}
        </h1>
        {description && (
          <p
            className="page__meta"
            style={{ margin: 0, maxWidth: 'var(--measure-form)', lineHeight: 'var(--leading-body)' }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
