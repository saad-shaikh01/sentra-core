import { Controller, Get, Patch, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators';
import { UpdateProfileDto } from './dto';
import { IUserProfile, JwtPayload } from '@sentra-core/types';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
  ) {}

  @Get('me')
  getMe(@CurrentUser('sub') userId: string): Promise<IUserProfile> {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<IUserProfile> {
    return this.usersService.updateMe(userId, dto);
  }

  @Patch(':userId/suspend')
  @HttpCode(HttpStatus.OK)
  suspendUser(
    @Param('userId') userId: string,
    @Body() body: { reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.suspendUser(userId, user.sub, user.orgId, body.reason);
  }

  @Patch(':userId/unsuspend')
  @HttpCode(HttpStatus.OK)
  unsuspendUser(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.unsuspendUser(userId, user.sub, user.orgId);
  }
}
