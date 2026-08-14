import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
} from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import type { SuggestionStatus } from '../persistence/mongo/schemas/agent-suggestion.schema';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  /** GET /suggestions?agentId=X&status=pending */
  @Get()
  async list(
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
  ) {
    if (!agentId) throw new BadRequestException('agentId is required');
    const validStatuses: SuggestionStatus[] = ['pending', 'applied', 'dismissed'];
    const resolvedStatus = validStatuses.includes(status as SuggestionStatus)
      ? (status as SuggestionStatus)
      : undefined;
    return this.suggestionsService.listForAgent(agentId, resolvedStatus);
  }

  /** POST /suggestions */
  @Post()
  async create(@Body() body: unknown) {
    const b = body as Record<string, unknown>;
    if (!b.agentId || typeof b.agentId !== 'string') throw new BadRequestException('agentId required');
    if (!b.callId || typeof b.callId !== 'string') throw new BadRequestException('callId required');
    if (!b.originalText || typeof b.originalText !== 'string') throw new BadRequestException('originalText required');
    if (!b.suggestedText || typeof b.suggestedText !== 'string') throw new BadRequestException('suggestedText required');
    return this.suggestionsService.create({
      agentId: b.agentId,
      callId: b.callId,
      targetType: 'greeting',
      originalText: b.originalText,
      suggestedText: b.suggestedText,
    });
  }

  /** PATCH /suggestions/:suggestionId — update status */
  @Patch(':suggestionId')
  async updateStatus(
    @Param('suggestionId') suggestionId: string,
    @Body() body: unknown,
  ) {
    const b = body as Record<string, unknown>;
    const validStatuses: SuggestionStatus[] = ['pending', 'applied', 'dismissed'];
    if (!validStatuses.includes(b.status as SuggestionStatus)) {
      throw new BadRequestException('status must be pending | applied | dismissed');
    }
    return this.suggestionsService.updateStatus(suggestionId, b.status as SuggestionStatus);
  }

  /**
   * POST /suggestions/synthesize
   * Use LLM to pick the single best greeting from all pending suggestions.
   * Returns { synthesizedGreeting, sourceCount }.
   */
  @Post('synthesize')
  async synthesize(@Body() body: unknown) {
    const b = body as Record<string, unknown>;
    if (!b.agentId || typeof b.agentId !== 'string') {
      throw new BadRequestException('agentId required');
    }
    return this.suggestionsService.synthesizeGreeting(
      b.agentId,
      typeof b.currentGreeting === 'string' ? b.currentGreeting : '',
    );
  }

  /**
   * POST /suggestions/mark-applied
   * Bulk-mark all pending greeting suggestions for an agent as applied.
   */
  @Post('mark-applied')
  @HttpCode(200)
  async markApplied(@Body() body: unknown) {
    const b = body as Record<string, unknown>;
    if (!b.agentId || typeof b.agentId !== 'string') {
      throw new BadRequestException('agentId required');
    }
    await this.suggestionsService.markAllApplied(b.agentId, 'greeting');
    return { ok: true };
  }
}
