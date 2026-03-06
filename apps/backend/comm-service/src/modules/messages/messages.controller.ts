import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/comm-api-response';
import { MessagesService } from './messages.service';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { SendMessageDto, ReplyDto, ForwardDto } from './dto/send-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';

@UseGuards(OrgContextGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get()
  async listMessages(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.service.listMessages(ctx.organizationId, query);
  }

  @Get(':id')
  async getMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const message = await this.service.getMessage(ctx.organizationId, id);
    return wrapSingle(message);
  }

  @Post('send')
  @UseInterceptors(IdempotencyInterceptor)
  async sendMessage(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.service.sendMessage(ctx.organizationId, ctx.userId, dto);
    return wrapSingle(message);
  }

  @Post(':id/reply')
  @UseInterceptors(IdempotencyInterceptor)
  async replyToMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    const message = await this.service.replyToMessage(ctx.organizationId, ctx.userId, id, dto);
    return wrapSingle(message);
  }

  @Post(':id/forward')
  @UseInterceptors(IdempotencyInterceptor)
  async forwardMessage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: ForwardDto,
  ) {
    const message = await this.service.forwardMessage(ctx.organizationId, ctx.userId, id, dto);
    return wrapSingle(message);
  }
}
