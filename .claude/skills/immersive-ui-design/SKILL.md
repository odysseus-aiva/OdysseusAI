---
name: immersive-ui-design
description: Design, redesign, review, and implement premium frontend UI/UX for this voice-agent platform. Use for dashboards, call history, call details, transcripts, agent configuration, tool configuration, animations, responsive layouts, visual polish, accessibility, and frontend UX work.
---

# Immersive UI Design

Before changing the UI:

1. Inspect the existing frontend architecture, routes, components, design system, styling approach, and installed packages.
2. Reuse existing libraries and components before adding dependencies.
3. Review the relevant product flow and backend APIs.
4. Preserve existing functionality.

## Design process

Work in two passes before writing any component code.

**Pass 1 — token sketch.** Name the palette (the project's `--color-void`, `--color-accent`, and state vars are the foundation — extend, don't replace), type scale, layout concept, and the one signature element this page will be remembered by.

**Pass 2 — self-critique.** Check the plan against the three generic AI design defaults that must be avoided regardless of how fitting they seem:
- Warm cream background + high-contrast serif + terracotta accent
- Near-black + single acid-green or vermilion accent
- Broadsheet grid with hairline rules and newspaper-dense columns

The orb is already the platform's signature element. Everything built around it — call history, transcripts, agent config — should be quiet and disciplined so the orb remains the one bold choice.

## Design direction

Create a premium and futuristic voice-AI experience that is:

- immersive but practical
- visually distinctive but not distracting
- responsive and accessible
- consistent across pages
- production-ready rather than a static mockup

Avoid:
- generic AI dashboards
- excessive glassmorphism
- unnecessary neon
- oversized cards
- visual clutter
- animation without purpose
- Inter font as the default (it reads as a template choice)
- uniform `border-radius` on every element
- centered-layout-as-default for every section
- purple gradients

## Copy

Words are design material. Apply the same intentionality as spacing and color.

- Write from the user's side: name things by what the user controls, not how the system is built. "End call" not "Terminate session."
- Active voice: buttons say exactly what happens — "Save changes," not "Submit."
- Keep action names consistent end-to-end: the button that says "Export" produces a toast that says "Exported."
- Errors explain what went wrong and how to fix it. Never vague ("Something went wrong"), never apologetic.
- Empty states are invitations to act, not decoration.

## Motion

Use motion to communicate:

- navigation and hierarchy
- loading and state changes
- voice states
- timeline progression
- user interaction feedback

Prefer existing animation libraries. Create reusable motion primitives instead of page-specific effects. Respect `prefers-reduced-motion`.

For detailed animation guidance, read `references/animation-guidelines.md`.

## Data visualization

Before building any chart, stat tile, KPI row, latency breakdown, sparkline, or heatmap — invoke the **`dataviz` skill**. It governs chart-type selection, categorical/sequential color formulas, stat tile layout, and accessibility. The call detail view's latency breakdown (sttLatencyMs / llmLatencyMs / ttsLatencyMs) and the call list's summary metrics both fall under this rule.

## Implementation

- Keep business logic outside presentation components.
- Build reusable components.
- Cover loading, empty, error, long-content, and responsive states.
- Use realistic application data.
- Watch for CSS specificity conflicts: a class selector (`.section`) and an element selector targeting the same property cancel each other out silently — audit padding and margin collisions when Tailwind utilities behave unexpectedly.
- Do not stop after producing a plan when implementation is requested.

### Visual verification

After implementation, drive the affected flow in the real running app using Playwright. The project runs two servers concurrently:

```bash
# Start backend (NestJS, port 3000) + frontend (Next.js, port 3001)
# Then run a headless Playwright script:
python scripts/with_server.py \
  --server "npm run start:dev" --port 3000 \
  --server "cd web && npm run dev" --port 3001 \
  -- python your_verification.py
```

In the Playwright script:
1. `page.wait_for_load_state('networkidle')` before any DOM inspection — Next.js routes hydrate after initial load.
2. Take a full-page screenshot (`full_page=True`) to catch layout issues below the fold.
3. Verify the golden path and at least one edge state (empty list, error, loading).
