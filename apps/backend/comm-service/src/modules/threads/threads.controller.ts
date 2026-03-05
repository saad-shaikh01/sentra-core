import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';
import { ThreadsService } from './threads.service';
import { ListThreadsQueryDto, ListMessagesQueryDto } from './dto/threads.dto';

@UseGuards(OrgContextGuard)
@Controller('threads')
export class ThreadsController {
  constructor(private readonly service: ThreadsService) {}

  @Get()
  async listThreads(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListThreadsQueryDto,
  ) {
    return this.service.listThreads(ctx.organizationId, query);
  }

  @Get(':threadId')
  async getThread(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    const thread = await this.service.getThread(ctx.organizationId, threadId);
    return wrapSingle(thread);
  }

  @Get(':threadId/messages')
  async listMessages(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.service.listMessages(ctx.organizationId, threadId, query);
  }

  @Patch(':threadId/read')
  @HttpCode(HttpStatus.OK)
  async markThreadRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('threadId') threadId: string,
  ) {
    await this.service.markThreadRead(ctx.organizationId, threadId);
    return COMM_MUTATION_OK;
  }
}
