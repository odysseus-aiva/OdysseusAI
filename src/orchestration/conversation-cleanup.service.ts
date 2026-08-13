import { Injectable, Logger, Inject, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { CONVERSATION_STATE_REPOSITORY } from './interfaces/conversation-state-repository.interface';
import type { ConversationStateRepository } from './interfaces/conversation-state-repository.interface';

const ORPHAN_CUTOFF_MS = 4 * 60 * 60 * 1000;   // 4 hours
const PRUNE_CUTOFF_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
const INTERVAL_MS      = 30 * 60 * 1000;          // run every 30 minutes

@Injectable()
export class ConversationCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ConversationCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly repo: ConversationStateRepository,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, INTERVAL_MS);

    // Run once shortly after boot to catch orphans from a previous crash.
    setTimeout(() => void this.runCleanup(), 60_000);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCleanup(): Promise<void> {
    const now = Date.now();
    try {
      const orphans = await this.repo.releaseOrphans(now - ORPHAN_CUTOFF_MS);
      if (orphans > 0) {
        this.logger.warn(`Cleaned up ${orphans} orphaned conversation(s) older than 4h`);
      }
    } catch (err) {
      this.logger.error(`Orphan cleanup failed: ${(err as Error).message}`);
    }

    try {
      const pruned = await this.repo.pruneArchivedMessages(now - PRUNE_CUTOFF_MS);
      if (pruned > 0) {
        this.logger.log(`Pruned llmMessages from ${pruned} archived conversation(s) older than 30d`);
      }
    } catch (err) {
      this.logger.error(`Message prune failed: ${(err as Error).message}`);
    }
  }
}
