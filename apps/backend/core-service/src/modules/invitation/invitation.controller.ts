import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { Roles, CurrentUser, Public } from '../auth/decorators';
import { CreateInvitationDto, AcceptInvitationDto, LinkInvitationDto } from './dto';
import { UserRole, IInvitation, JwtPayload, ILoginResponse } from '@sentra-core/types';

@Controller('organization')
export class InvitationController {
  constructor(private invitationService: InvitationService) {}

  @Post('invite')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createInvitation(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<IInvitation> {
    return this.invitationService.createInvitation(dto, currentUser);
  }

  @Get('invitations')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  getPendingInvitations(
    @CurrentUser('orgId') orgId: string,
  ): Promise<IInvitation[]> {
    return this.invitationService.getPendingInvitations(orgId);
  }

  @Delete('invitations/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  cancelInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    return this.invitationService.cancelInvitation(invitationId, currentUser);
  }

  @Post('link-invite')
  linkInvitation(
    @Body() dto: LinkInvitationDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    return this.invitationService.linkInvitation(dto, currentUser);
  }
}

@Controller('auth')
export class InvitationAuthController {
  constructor(private invitationService: InvitationService) {}

  @Public()
  @Get('invite')
  getInvitationByToken(
    @Query('token') token: string,
  ): Promise<IInvitation & { organizationName: string }> {
    return this.invitationService.getInvitationByToken(token);
  }

  @Public()
  @Post('accept-invite')
  acceptInvitation(@Body() dto: AcceptInvitationDto): Promise<ILoginResponse> {
    return this.invitationService.acceptInvitation(dto);
  }
}
