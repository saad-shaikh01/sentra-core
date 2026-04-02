import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@sentra-core/types';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { ThreadsService } from './threads.service';
import { ListThreadsQueryDto, ListMessagesQueryDto, BatchThreadActionDto } from './dto/threads.dto';

@SkipThrottle()
@UseGuards(OrgContextGuard)
@Controller('threads')
export class ThreadsController {
  constructor(private readonly service: ThreadsService) {}

  @Get()
  async listThreads(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListThreadsQueryDto,
  ) {
    return this.service.listThreads(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      query,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@GetOrgContext() ctx: OrgContext) {
    return this.service.getUnreadCount(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
  }

  @Get(':threadId')
  async getThread(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    const thread = await this.service.getThread(
      ctx.organizationId,
      threadId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return wrapSingle(thread);
  }

  @Get(':threadId/messages')
  async listMessages(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.service.listMessages(
      ctx.organizationId,
      threadId,
      ctx.userId,
      ctx.userRole as UserRole,
      query,
    );
  }

  @Patch(':threadId/archive')
  @HttpCode(HttpStatus.OK)
  async archiveThread(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    await this.service.archiveThread(ctx.organizationId, threadId);
    return COMM_MUTATION_OK;
  }

  @Patch(':threadId/read')
  @HttpCode(HttpStatus.OK)
  async markThreadRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    await this.service.markThreadRead(
      ctx.organizationId,
      threadId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return COMM_MUTATION_OK;
  }

  @Patch(':threadId/unread')
  @HttpCode(HttpStatus.OK)
  async markThreadUnread(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    await this.service.markThreadUnread(
      ctx.organizationId,
      threadId,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return COMM_MUTATION_OK;
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async batchAction(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: BatchThreadActionDto,
  ) {
    const result = await this.service.batchAction(
      ctx.organizationId,
      dto.threadIds,
      dto.action,
      ctx.userId,
      ctx.userRole as UserRole,
    );
    return { data: result };
  }
}
