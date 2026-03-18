import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import { PendingInvitationsQueryDto } from './dto';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('employees/:id/invite')
  @Permissions('hrms:users:invite')
  async sendInvite(
    @Param('id') userId: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.invitationsService.sendInvite(
        userId,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Post('employees/:id/invite/resend')
  @Permissions('hrms:users:invite')
  async resendInvite(
    @Param('id') userId: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.invitationsService.resendInvite(
        userId,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Delete('employees/:id/invite')
  @Permissions('hrms:users:invite')
  async cancelInvite(
    @Param('id') userId: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.invitationsService.cancelInvite(
        userId,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Get('invitations/pending')
  @Permissions('hrms:users:invite')
  async getPendingInvitations(
    @Query() query: PendingInvitationsQueryDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return this.invitationsService.getPendingInvitations(context.organizationId, query);
  }
}
