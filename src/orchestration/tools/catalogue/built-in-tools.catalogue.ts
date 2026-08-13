export type BuiltInToolCategory =
  | 'utility'
  | 'information'
  | 'call_control'
  | 'demo';

export interface BuiltInToolCatalogueEntry {
  name: string;
  displayName: string;
  description: string;
  category: BuiltInToolCategory;
  /** JSON Schema describing per-agent config fields for the UI */
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  /** Env var names required for the tool to work in production */
  requiredEnv: string[];
  /** Whether this tool appears in the assignable catalogue UI */
  assignable: boolean;
}

/** Shared Retell-style speak-during-execution fields for assignable tools */
const EXECUTION_SPEECH_SCHEMA_PROPS = {
  speakDuringExecution: {
    type: 'boolean',
    description:
      'If true, speak a short message while this tool is running (avoids silence)',
  },
  executionMessage: {
    type: 'string',
    description:
      'Exact text spoken while the tool runs (static; keep short for voice)',
  },
} as const;

/**
 * Code-defined catalogue of built-in tools.
 * Implementations live as Nest AgentTool classes; assignments/config live in MongoDB.
 */
export const BUILT_IN_TOOLS_CATALOGUE: BuiltInToolCatalogueEntry[] = [
  {
    name: 'get_weather',
    displayName: 'Weather',
    description:
      'Get current weather and short-range forecasts for a city or location. Use for questions about temperature, rain, or conditions today, tomorrow, or this weekend.',
    category: 'information',
    assignable: true,
    requiredEnv: [],
    defaultConfig: {
      units: 'metric',
      forecastDays: 7,
      defaultLocation: '',
      speakDuringExecution: true,
      executionMessage: 'One moment, let me check the weather.',
    },
    configSchema: {
      type: 'object',
      properties: {
        units: {
          type: 'string',
          enum: ['metric', 'imperial'],
          description: 'Temperature and wind units',
        },
        forecastDays: {
          type: 'integer',
          minimum: 1,
          maximum: 7,
          description: 'Number of daily forecast days to return',
        },
        defaultLocation: {
          type: 'string',
          description: 'Fallback location when the user does not specify one',
        },
        ...EXECUTION_SPEECH_SCHEMA_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'web_search',
    displayName: 'Web Search',
    description:
      'Search the web for current information. Summarize findings briefly for voice; do not read URLs aloud unless the user asks for sources.',
    category: 'information',
    assignable: true,
    requiredEnv: ['TAVILY_API_KEY'],
    defaultConfig: {
      maxResults: 3,
      searchDepth: 'basic',
      allowedDomains: [],
      blockedDomains: [],
      allowNews: true,
      maxContentLength: 280,
      speakDuringExecution: true,
      executionMessage: 'One moment, let me look that up.',
    },
    configSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Maximum number of search results',
        },
        searchDepth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: 'Search depth (provider-dependent)',
        },
        allowedDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only include results from these domains',
        },
        blockedDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude results from these domains',
        },
        allowNews: {
          type: 'boolean',
          description: 'Whether news-oriented search is allowed',
        },
        maxContentLength: {
          type: 'integer',
          minimum: 80,
          maximum: 2000,
          description: 'Max characters of snippet content sent to the LLM',
        },
        ...EXECUTION_SPEECH_SCHEMA_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_current_datetime',
    displayName: 'Current Date and Time',
    description:
      'Get the current date and time, optionally in a specific IANA timezone.',
    category: 'utility',
    assignable: true,
    requiredEnv: [],
    defaultConfig: {
      defaultTimezone: 'UTC',
      speakDuringExecution: false,
      executionMessage: 'Let me check the time.',
    },
    configSchema: {
      type: 'object',
      properties: {
        defaultTimezone: {
          type: 'string',
          description: 'IANA timezone used when the caller does not specify one',
        },
        ...EXECUTION_SPEECH_SCHEMA_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'end_call',
    displayName: 'End Call',
    description:
      'End the voice call when the user wants to hang up or the conversation is complete. Say a brief farewell before ending.',
    category: 'call_control',
    assignable: true,
    requiredEnv: [],
    defaultConfig: {
      speakDuringExecution: false,
      executionMessage: '',
    },
    configSchema: {
      type: 'object',
      properties: {
        ...EXECUTION_SPEECH_SCHEMA_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_user_details',
    displayName: 'User Details (Demo)',
    description: 'Demo tool that fetches sample user details. Not shown in agent assignment UI by default.',
    category: 'demo',
    assignable: false,
    requiredEnv: [],
    defaultConfig: {},
    configSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export function getCatalogueEntry(
  toolName: string,
): BuiltInToolCatalogueEntry | undefined {
  return BUILT_IN_TOOLS_CATALOGUE.find((t) => t.name === toolName);
}

export function listAssignableCatalogue(): BuiltInToolCatalogueEntry[] {
  return BUILT_IN_TOOLS_CATALOGUE.filter((t) => t.assignable);
}

export function isKnownBuiltInTool(toolName: string): boolean {
  return BUILT_IN_TOOLS_CATALOGUE.some((t) => t.name === toolName);
}
