import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';
import { DepartmentsService } from './departments.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Permissions('hrms:teams:view')
  async findAll(@OrgContext() context: { organizationId: string }) {
    return this.departmentsService.findAll(context.organizationId);
  }

  @Post()
  @Permissions('hrms:departments:manage')
  async create(
    @Body() dto: CreateDepartmentDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.departmentsService.create(context.organizationId, dto),
    };
  }

  @Patch(':id')
  @Permissions('hrms:departments:manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.departmentsService.update(id, context.organizationId, dto),
    };
  }

  @Delete(':id')
  @Permissions('hrms:departments:manage')
  async remove(
    @Param('id') id: string,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.departmentsService.remove(id, context.organizationId),
    };
  }
}
