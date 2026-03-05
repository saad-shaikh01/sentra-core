/**
 * ThreadsController — PM-BE-016
 *
 * Routes (global prefix /api/pm):
 *   POST   /api/pm/threads                           — create thread
 *   GET    /api/pm/threads/:id                       — thread detail
 *   GET    /api/pm/threads/scope                     — find thread by scope
 *   GET    /api/pm/threads/:id/head                  — message head metadata
 *   POST   /api/pm/threads/:id/messages              — create message
 *   GET    /api/pm/threads/:id/messages              — list messages (paginated)
 *   PATCH  /api/pm/messages/:id                      — update message body
 *   POST   /api/pm/threads/:id/read                  — mark thread as read
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@UseGuards(OrgContextGuard)
@Controller()
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  // ── thread CRUD ───────────────────────────────────────────────────────────

  @Post('threads')
  @HttpCode(HttpStatus.CREATED)
  async createThread(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateThreadDto,
  ) {
    const thread = await this.threadsService.createThread(ctx.organizationId, ctx.userId, dto);
    return wrapSingle(thread);
  }

  @Get('threads/:id')
  async findThread(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const thread = await this.threadsService.findThread(ctx.organizationId, id);
    return wrapSingle(thread);
  }

  @Get('threads/scope/lookup')
  async findByScope(
    @GetOrgContext() ctx: OrgContext,
    @Query('scopeType') scopeType: string,
    @Query('scopeId') scopeId: string,
  ) {
    const thread = await this.threadsService.findByScopeOrFail(
      ctx.organizationId,
      scopeType,
      scopeId,
    );
    return wrapSingle(thread);
  }

  @Get('threads/:id/head')
  async head(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const head = await this.threadsService.getHead(ctx.organizationId, id);
    return wrapSingle(head);
  }

  // ── messages ──────────────────────────────────────────────────────────────

  @Post('threads/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async createMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') threadId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const message = await this.threadsService.createMessage(
      ctx.organizationId,
      threadId,
      ctx.userId,
      dto,
    );
    return wrapSingle(message);
  }

  @Get('threads/:id/messages')
  async listMessages(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') threadId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.threadsService.listMessages(
      ctx.organizationId,
      threadId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 30,
    );
  }

  @Patch('messages/:id')
  async updateMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    const message = await this.threadsService.updateMessage(
      ctx.organizationId,
      messageId,
      ctx.userId,
      dto,
    );
    return wrapSingle(message);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') messageId: string,
  ) {
    const message = await this.threadsService.deleteMessage(
      ctx.organizationId,
      messageId,
      ctx.userId,
    );
    return wrapSingle(message);
  }

  // ── read state ────────────────────────────────────────────────────────────

  @Post('threads/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') threadId: string,
  ) {
    return this.threadsService.markRead(ctx.organizationId, threadId, ctx.userId);
  }
}
