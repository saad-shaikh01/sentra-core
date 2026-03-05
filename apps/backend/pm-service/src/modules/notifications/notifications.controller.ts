import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(OrgContextGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.list(ctx.organizationId, ctx.userId, query);
  }

  @Post(':id/read')
  async markRead(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const row = await this.notificationsService.markRead(
      ctx.organizationId,
      ctx.userId,
      id,
    );
    return wrapSingle(row);
  }

  @Post('read-all')
  async markAllRead(@GetOrgContext() ctx: OrgContext) {
    return this.notificationsService.markAllRead(ctx.organizationId, ctx.userId);
  }
}
