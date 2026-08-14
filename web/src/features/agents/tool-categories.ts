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
  /**
   * Colour token for the category glyph. Every category resolves to the same
   * neutral: a hue per category is decorative colour on chrome, and category is
   * already carried by the icon and the label. The field stays so the glyph
   * colour has one definition rather than one per call site.
   */
  color: string;
  description: string;
}

/** The one colour a category glyph may take. */
const GLYPH = 'var(--fg-muted)';

export const TOOL_CATEGORIES: Record<string, ToolCategoryMeta> = {
  // ── Live today ──────────────────────────────────────────────────────────
  information: {
    id: 'information',
    label: 'Information',
    icon: Cloud,
    color: GLYPH,
    description: 'Look up external facts and data',
  },
  utility: {
    id: 'utility',
    label: 'Utility',
    icon: Wrench,
    color: GLYPH,
    description: 'Time, math, and formatting helpers',
  },
  call_control: {
    id: 'call_control',
    label: 'Call control',
    icon: PhoneOff,
    color: GLYPH,
    description: 'Steer the call itself',
  },
  demo: {
    id: 'demo',
    label: 'Demo',
    icon: FlaskConical,
    color: GLYPH,
    description: 'Sample tools for testing',
  },

  // ── Reserved for future backend categories ─────────────────────────────
  search: {
    id: 'search',
    label: 'Search',
    icon: Search,
    color: GLYPH,
    description: 'Web and document retrieval',
  },
  communication: {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    color: GLYPH,
    description: 'Send email, SMS, and notifications',
  },
  crm: {
    id: 'crm',
    label: 'CRM',
    icon: Users,
    color: GLYPH,
    description: 'Read and write customer records',
  },
  integrations: {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    color: GLYPH,
    description: 'Third-party service actions',
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    icon: Code2,
    color: GLYPH,
    description: 'Your own HTTP functions',
  },
  mcp: {
    id: 'mcp',
    label: 'MCP',
    icon: Server,
    color: GLYPH,
    description: 'Tools exposed by MCP servers',
  },
};

export const UNKNOWN_CATEGORY: ToolCategoryMeta = {
  id: 'other',
  label: 'Other',
  icon: Wrench,
  color: GLYPH,
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
