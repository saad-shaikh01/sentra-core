import { Controller, Get, Patch, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators';
import { UpdateProfileDto } from './dto';
import { IUserProfile } from '@sentra-core/types';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

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
}
