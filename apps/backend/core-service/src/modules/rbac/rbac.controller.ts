import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { JwtPayload } from '@sentra-core/types';
import { RbacService } from './rbac.service';
import {
  CreateAppRoleDto,
  ReplaceAppRolePermissionsDto,
  UpdateAppRoleDto,
} from './dto';

@Controller('rbac/apps')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get(':appCode/roles')
  async listRoles(@Param('appCode') appCode: string, @CurrentUser() currentUser: JwtPayload) {
    return { data: await this.rbacService.listRoles(appCode, currentUser) };
  }

  @Post(':appCode/roles')
  async createRole(
    @Param('appCode') appCode: string,
    @Body() dto: CreateAppRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.rbacService.createRole(appCode, dto, currentUser) };
  }

  @Patch(':appCode/roles/:roleId')
  async updateRole(
    @Param('appCode') appCode: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateAppRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.rbacService.updateRole(appCode, roleId, dto, currentUser) };
  }

  @Delete(':appCode/roles/:roleId')
  async deleteRole(
    @Param('appCode') appCode: string,
    @Param('roleId') roleId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.rbacService.deleteRole(appCode, roleId, currentUser) };
  }

  @Get(':appCode/permissions')
  async listPermissions(@Param('appCode') appCode: string) {
    return { data: await this.rbacService.listPermissions(appCode) };
  }

  @Put(':appCode/roles/:roleId/permissions')
  async replaceRolePermissions(
    @Param('appCode') appCode: string,
    @Param('roleId') roleId: string,
    @Body() dto: ReplaceAppRolePermissionsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.rbacService.replaceRolePermissions(appCode, roleId, dto, currentUser) };
  }

  @Get(':appCode/roles/:roleId/permissions')
  async getRolePermissions(
    @Param('appCode') appCode: string,
    @Param('roleId') roleId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return { data: await this.rbacService.getRolePermissions(appCode, roleId, currentUser) };
  }
}
