import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AccessTokenGuard } from './guards';
import { CurrentUser } from './decorators';
import { JwtPayload } from '@sentra-core/types';
import { SessionsService } from './sessions.service';

@Controller('admin/users/:userId')
@UseGuards(AccessTokenGuard)
export class AdminSessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get('sessions')
  async getSessions(
    @Param('userId') userId: string,
    @Query('status') status: 'active' | 'all' = 'active',
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.sessionsService.getUserSessions(
      userId,
      admin.orgId,
      status,
      Number(page),
      Number(limit),
    );
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: JwtPayload,
  ) {
    await this.sessionsService.revokeSession(sessionId, userId, admin.sub, body?.reason);
    return { message: 'Session revoked' };
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: JwtPayload,
  ) {
    const result = await this.sessionsService.revokeAllUserSessions(
      userId,
      admin.sub,
      admin.orgId,
      body?.reason,
    );
    return { message: `${result.count} sessions revoked` };
  }
}
