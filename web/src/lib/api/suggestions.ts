export type SuggestionTargetType = 'greeting';
export type SuggestionStatus = 'pending' | 'applied' | 'dismissed';

export interface AgentSuggestion {
  suggestionId: string;
  agentId: string;
  callId: string;
  targetType: SuggestionTargetType;
  originalText: string;
  suggestedText: string;
  status: SuggestionStatus;
  createdAt: number;
  updatedAt: number;
}

export async function createSuggestion(input: {
  agentId: string;
  callId: string;
  originalText: string;
  suggestedText: string;
}): Promise<AgentSuggestion> {
  const res = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to save suggestion (${res.status})`);
  return res.json() as Promise<AgentSuggestion>;
}

export async function fetchSuggestions(
  agentId: string,
  status?: SuggestionStatus,
): Promise<AgentSuggestion[]> {
  const params = new URLSearchParams({ agentId });
  if (status) params.set('status', status);
  const res = await fetch(`/api/suggestions?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load suggestions (${res.status})`);
  return res.json() as Promise<AgentSuggestion[]>;
}

export async function updateSuggestionStatus(
  suggestionId: string,
  status: SuggestionStatus,
): Promise<AgentSuggestion> {
  const res = await fetch(`/api/suggestions/${encodeURIComponent(suggestionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update suggestion (${res.status})`);
  return res.json() as Promise<AgentSuggestion>;
}

export async function synthesizeGreeting(
  agentId: string,
  currentGreeting: string,
): Promise<{ synthesizedGreeting: string; sourceCount: number }> {
  const res = await fetch('/api/suggestions/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, currentGreeting }),
  });
  if (!res.ok) throw new Error(`Synthesis failed (${res.status})`);
  return res.json() as Promise<{ synthesizedGreeting: string; sourceCount: number }>;
}

export async function markGreetingSuggestionsApplied(agentId: string): Promise<void> {
  await fetch('/api/suggestions/mark-applied', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
}
