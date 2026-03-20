import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Get('search')
  async searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query('q') q: string,
  ) {
    return this.usersService.searchUsers(user.orgId, q);
  }

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

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: any,
  ): Promise<IUserProfile> {
    if (!file) throw new BadRequestException('No file provided');
    return this.usersService.uploadAvatar(
      userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
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
