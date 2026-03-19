import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, Public } from '../auth/decorators';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { JwtPayload } from '@sentra-core/types';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.service.list(user.sub, user.orgId, query);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.service.markAllRead(user.sub, user.orgId);
  }

  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.markRead(id, user.sub);
  }

  @Post('push-tokens')
  registerToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.service.registerPushToken(user.sub, user.orgId, dto);
  }

  @Delete('push-tokens/:token')
  unregisterToken(
    @Param('token') token: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.unregisterPushToken(token, user.sub);
  }

  // Internal endpoint — for comm-service and other services without BullMQ
  @Post('internal')
  @Public()
  createInternal(@Body() payload: any) {
    return this.service.createInternal(payload);
  }
}
