import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import { AccessManagementService } from './access-management.service';
import { AssignAppRoleDto, GrantAppAccessDto } from './dto';

@Controller('employees')
export class AccessManagementController {
  constructor(private readonly accessManagementService: AccessManagementService) {}

  @Get(':id/access')
  @Permissions('hrms:users:manage_access')
  async getAccessSummary(
    @Param('id') userId: string,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.accessManagementService.getAccessSummary(userId, context.organizationId),
    };
  }

  @Post(':id/access')
  @Permissions('hrms:users:manage_access')
  async grantAccess(
    @Param('id') userId: string,
    @Body() dto: GrantAppAccessDto,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.accessManagementService.grantAccess(
        userId,
        dto.appCode,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Delete(':id/access/:appCode')
  @Permissions('hrms:users:manage_access')
  async revokeAccess(
    @Param('id') userId: string,
    @Param('appCode') appCode: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.accessManagementService.revokeAccess(
        userId,
        appCode,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Post(':id/roles')
  @Permissions('hrms:users:manage_access')
  async assignRole(
    @Param('id') userId: string,
    @Body() dto: AssignAppRoleDto,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.accessManagementService.assignRole(
        userId,
        dto.appRoleId,
        context.organizationId,
        context.userId,
      ),
    };
  }

  @Delete(':id/roles/:userAppRoleId')
  @Permissions('hrms:users:manage_access')
  async removeRole(
    @Param('id') userId: string,
    @Param('userAppRoleId') userAppRoleId: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.accessManagementService.removeRole(
        userId,
        userAppRoleId,
        context.organizationId,
        context.userId,
      ),
    };
  }
}
