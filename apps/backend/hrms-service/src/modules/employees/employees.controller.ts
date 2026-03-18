import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import {
  CreateEmployeeDto,
  EmployeesQueryDto,
  SuspendEmployeeDto,
  UpdateEmployeeDto,
} from './dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Permissions('hrms:users:view')
  async findAll(
    @Query() query: EmployeesQueryDto,
    @OrgContext() ctx: { organizationId: string },
  ) {
    return this.employeesService.findAll(ctx.organizationId, query);
  }

  @Get(':id')
  @Permissions('hrms:users:view')
  async findOne(
    @Param('id') id: string,
    @OrgContext() ctx: { organizationId: string },
  ) {
    return { data: await this.employeesService.findOne(id, ctx.organizationId) };
  }

  @Post()
  @Permissions('hrms:users:create')
  async create(
    @Body() dto: CreateEmployeeDto,
    @OrgContext() ctx: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.employeesService.create(ctx.organizationId, dto, ctx.userId),
    };
  }

  @Patch(':id')
  @Permissions('hrms:users:edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @OrgContext() ctx: { organizationId: string },
  ) {
    return { data: await this.employeesService.update(id, ctx.organizationId, dto) };
  }

  @Patch(':id/suspend')
  @Permissions('hrms:users:suspend')
  async suspend(
    @Param('id') id: string,
    @Body() dto: SuspendEmployeeDto,
    @OrgContext() ctx: { userId: string; organizationId: string },
  ) {
    return {
      data: await this.employeesService.suspend(id, ctx.userId, ctx.organizationId, dto.reason),
    };
  }

  @Patch(':id/unsuspend')
  @Permissions('hrms:users:suspend')
  async unsuspend(
    @Param('id') id: string,
    @OrgContext() ctx: { userId: string; organizationId: string },
  ) {
    return {
      data: await this.employeesService.unsuspend(id, ctx.userId, ctx.organizationId),
    };
  }

  @Patch(':id/deactivate')
  @Permissions('hrms:users:deactivate')
  async deactivate(
    @Param('id') id: string,
    @OrgContext() ctx: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.employeesService.deactivate(id, ctx.organizationId, ctx.userId),
    };
  }
}
