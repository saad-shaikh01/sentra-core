import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { JwtPayload } from '@sentra-core/types';
import { IamService } from './iam.service';
import { CreateIamInvitationDto, UpdateUserEntitlementsDto } from './dto';

@Controller('iam')
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @Post('invitations')
  createInvitation(
    @Body() dto: CreateIamInvitationDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.iamService.createInvitation(dto, currentUser);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() currentUser: JwtPayload) {
    return this.iamService.listInvitations(currentUser);
  }

  @Post('invitations/:id/resend')
  resendInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.iamService.resendInvitation(invitationId, currentUser);
  }

  @Delete('invitations/:id')
  cancelInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.iamService.cancelInvitation(invitationId, currentUser);
  }

  @Post('users/:userId/entitlements')
  updateUserEntitlements(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserEntitlementsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.iamService.updateUserEntitlements(userId, dto, currentUser);
  }
}
