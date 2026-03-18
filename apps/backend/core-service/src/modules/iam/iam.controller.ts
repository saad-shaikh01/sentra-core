import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { JwtPayload } from '@sentra-core/types';
import { IamService } from './iam.service';
import {
  AssignAppRoleDto,
  CreateIamInvitationDto,
  GrantAppAccessDto,
  UpdateUserEntitlementsDto,
} from './dto';

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

  @Post('users/:userId/app-access')
  async grantAppAccess(
    @Param('userId') userId: string,
    @Body() dto: GrantAppAccessDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.grantAppAccess(userId, dto.appCode, currentUser) };
  }

  @Delete('users/:userId/app-access/:appCode')
  async revokeAppAccess(
    @Param('userId') userId: string,
    @Param('appCode') appCode: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.revokeAppAccess(userId, appCode, currentUser) };
  }

  @Get('users/:userId/app-access')
  async getUserAppAccess(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.getUserAppAccess(currentUser.orgId, userId) };
  }

  @Post('users/:userId/app-roles')
  async assignAppRole(
    @Param('userId') userId: string,
    @Body() dto: AssignAppRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.assignAppRole(userId, dto.appRoleId, currentUser) };
  }

  @Delete('users/:userId/app-roles/:id')
  async removeAppRole(
    @Param('userId') userId: string,
    @Param('id') assignmentId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.removeAppRole(userId, assignmentId, currentUser) };
  }

  @Get('users/:userId/app-roles')
  async getUserAppRoles(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.iamService.getUserAppRoles(userId, currentUser) };
  }
}
