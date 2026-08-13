import { getCatalogueEntry } from './catalogue/built-in-tools.catalogue';

const MAX_FILLER_CHARS = 160;

export interface ExecutionFiller {
  toolName: string;
  text: string;
}

/**
 * Resolve Retell-style static speak-during-execution text for a tool round.
 * Uses the first called tool that has speakDuringExecution enabled and a message.
 */
export function resolveExecutionFiller(
  toolNames: string[],
  toolConfigs?: Record<string, Record<string, unknown>>,
): ExecutionFiller | null {
  for (const toolName of toolNames) {
    const catalogue = getCatalogueEntry(toolName);
    const config = {
      ...(catalogue?.defaultConfig ?? {}),
      ...(toolConfigs?.[toolName] ?? {}),
    };

    if (config.speakDuringExecution !== true) continue;

    const raw =
      typeof config.executionMessage === 'string'
        ? config.executionMessage.trim()
        : '';
    if (!raw) continue;

    const text =
      raw.length > MAX_FILLER_CHARS
        ? `${raw.slice(0, MAX_FILLER_CHARS - 1)}…`
        : raw;

    return { toolName, text };
  }

  return null;
}
