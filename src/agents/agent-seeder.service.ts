import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AgentsService } from './agents.service';

/**
 * First-run experience: if no agents exist, seed one working sample agent so a
 * fresh clone has something to open, configure, and call immediately. Runs once
 * at bootstrap and is a no-op the moment any agent exists — it never overwrites
 * user data.
 */
@Injectable()
export class AgentSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentSeederService.name);

  constructor(private readonly agentsService: AgentsService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const existing = await this.agentsService.list();
      if (existing.length > 0) return;

      this.logger.log('No agents found — seeding sample agent "assistant"');

      await this.agentsService.create({
        agentId: 'assistant',
        name: 'Sample Assistant',
        engine: 'pipeline',
        systemPrompt:
          'You are a helpful voice assistant for a demo of the Synaptic voice platform. ' +
          'Keep answers short and natural for speech — one or two sentences. ' +
          'You can check the weather, tell the current date and time, and search the web. ' +
          'Use those tools instead of guessing. When the caller says goodbye, end the call.',
        greeting:
          'Hi! I’m the Synaptic sample assistant. Ask me about the weather, the time, or anything you’d like me to look up.',
      });

      // Enable a few safe, key-free-friendly tools out of the box so the sample
      // agent can actually take actions in the demo.
      await this.agentsService.upsertTools('assistant', [
        { toolName: 'get_current_datetime', enabled: true },
        { toolName: 'get_weather', enabled: true },
        { toolName: 'web_search', enabled: true },
        { toolName: 'end_call', enabled: true },
      ]);

      this.logger.log('Sample agent "assistant" seeded with 4 tools');
    } catch (err) {
      // Seeding must never block startup — log and move on.
      this.logger.warn(
        `Sample agent seeding skipped: ${(err as Error).message}`,
      );
    }
  }
}
