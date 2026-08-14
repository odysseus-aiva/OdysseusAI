'use client';

import { BookOpen, FileStack, Server, Database } from 'lucide-react';
import { Section, EmptyState } from '@/components/ui/Section';

/**
 * Reserved for retrieval-backed grounding. Rendered as an explicit roadmap
 * rather than a blank tab so the gap reads as planned scope.
 */
export function KnowledgeTab() {
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Knowledge sources"
        description="Ground the agent in your own content so it answers from fact instead of memory."
      >
        <EmptyState
          icon={BookOpen}
          title="No knowledge sources yet"
          description="Once connected, the agent will retrieve relevant passages mid-call and cite them in the transcript."
          planned={['Documents', 'FAQ pairs', 'Website crawl', 'Vector search', 'MCP resources']}
        />
      </Section>

      <Section title="What this will support" description="Planned capabilities for this tab.">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(212px, 1fr))' }}>
          <PlannedCard
            icon={FileStack}
            title="Documents & FAQs"
            body="Upload PDFs, docs, and question–answer pairs. Chunked and embedded on ingest."
          />
          <PlannedCard
            icon={Database}
            title="Retrieval settings"
            body="Per-agent top-k, similarity threshold, and whether to refuse when nothing matches."
          />
          <PlannedCard
            icon={Server}
            title="MCP servers"
            body="Attach Model Context Protocol servers to expose their resources and tools to this agent."
          />
        </div>
      </Section>
    </div>
  );
}

function PlannedCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="card flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
        <span className="text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
          {title}
        </span>
      </span>
      <p className="text-caption leading-body" style={{ color: 'var(--fg-muted)' }}>
        {body}
      </p>
    </div>
  );
}
