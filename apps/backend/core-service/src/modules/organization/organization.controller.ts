import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { Roles, CurrentUser } from '../auth/decorators';
import { UpdateRoleDto } from './dto';
import { UserRole, IOrganizationMember, JwtPayload } from '@sentra-core/types';

@Controller('organization')
export class OrganizationController {
  constructor(private organizationService: OrganizationService) {}

  @Get('members')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  getMembers(@CurrentUser('orgId') orgId: string): Promise<IOrganizationMember[]> {
    return this.organizationService.getMembers(orgId);
  }

  @Patch('members/:userId/role')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateMemberRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<IOrganizationMember> {
    return this.organizationService.updateMemberRole(userId, dto, currentUser);
  }

  @Delete('members/:userId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  removeMember(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    return this.organizationService.removeMember(userId, currentUser);
  }
}
