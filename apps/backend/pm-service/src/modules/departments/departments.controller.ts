import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@UseGuards(OrgContextGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  async list(@GetOrgContext() ctx: OrgContext) {
    const data = await this.service.list(ctx.organizationId);
    return { data };
  }

  @Get(':id')
  async findOne(@GetOrgContext() ctx: OrgContext, @Param('id') id: string) {
    return wrapSingle(await this.service.findOne(ctx.organizationId, id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@GetOrgContext() ctx: OrgContext, @Body() dto: CreateDepartmentDto) {
    return wrapSingle(await this.service.create(ctx.organizationId, dto));
  }

  @Get(':id/members')
  async listMembers(@GetOrgContext() ctx: OrgContext, @Param('id') id: string) {
    const data = await this.service.listMembers(ctx.organizationId, id);
    return { data };
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return wrapSingle(await this.service.addMember(ctx.organizationId, id, dto));
  }

  @Patch(':id/members/:userId')
  async updateMember(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return wrapSingle(await this.service.updateMember(ctx.organizationId, id, userId, dto));
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return wrapSingle(await this.service.removeMember(ctx.organizationId, id, userId));
  }
}
