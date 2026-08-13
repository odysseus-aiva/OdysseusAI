import {
  Cloud,
  Wrench,
  PhoneOff,
  FlaskConical,
  Search,
  MessageSquare,
  Users,
  Plug,
  Code2,
  Server,
  type LucideIcon,
} from 'lucide-react';

/**
 * Display metadata for tool categories.
 *
 * Backend currently emits `information | utility | call_control | demo`
 * (see `built-in-tools.catalogue.ts`). The remaining entries are declared ahead
 * of the backend so a new category renders correctly the moment it ships —
 * unknown categories fall back to `UNKNOWN_CATEGORY` rather than breaking.
 */
export interface ToolCategoryMeta {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Accent color token for the category glyph. */
  color: string;
  description: string;
}

export const TOOL_CATEGORIES: Record<string, ToolCategoryMeta> = {
  // ── Live today ──────────────────────────────────────────────────────────
  information: {
    id: 'information',
    label: 'Information',
    icon: Cloud,
    color: 'var(--color-accent)',
    description: 'Look up external facts and data',
  },
  utility: {
    id: 'utility',
    label: 'Utility',
    icon: Wrench,
    color: 'var(--color-state-warning)',
    description: 'Time, math, and formatting helpers',
  },
  call_control: {
    id: 'call_control',
    label: 'Call control',
    icon: PhoneOff,
    color: 'var(--color-state-speaking)',
    description: 'Steer the call itself',
  },
  demo: {
    id: 'demo',
    label: 'Demo',
    icon: FlaskConical,
    color: 'var(--color-state-thinking)',
    description: 'Sample tools for testing',
  },

  // ── Reserved for future backend categories ─────────────────────────────
  search: {
    id: 'search',
    label: 'Search',
    icon: Search,
    color: 'var(--color-accent)',
    description: 'Web and document retrieval',
  },
  communication: {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    color: 'var(--color-accent-2)',
    description: 'Send email, SMS, and notifications',
  },
  crm: {
    id: 'crm',
    label: 'CRM',
    icon: Users,
    color: 'var(--color-state-warning)',
    description: 'Read and write customer records',
  },
  integrations: {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    color: 'var(--color-state-speaking)',
    description: 'Third-party service actions',
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    icon: Code2,
    color: 'var(--color-text-muted)',
    description: 'Your own HTTP functions',
  },
  mcp: {
    id: 'mcp',
    label: 'MCP',
    icon: Server,
    color: 'var(--color-accent-2)',
    description: 'Tools exposed by MCP servers',
  },
};

export const UNKNOWN_CATEGORY: ToolCategoryMeta = {
  id: 'other',
  label: 'Other',
  icon: Wrench,
  color: 'var(--color-text-muted)',
  description: 'Uncategorized',
};

export function categoryMeta(id: string): ToolCategoryMeta {
  return TOOL_CATEGORIES[id] ?? { ...UNKNOWN_CATEGORY, id, label: humanize(id) };
}

/** `call_control` → `Call control` for categories with no registry entry yet. */
function humanize(id: string): string {
  const spaced = id.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
