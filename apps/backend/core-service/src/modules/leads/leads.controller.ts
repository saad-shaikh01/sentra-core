import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Roles, CurrentUser } from '../auth/decorators';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeStatusDto,
  AssignLeadDto,
  AddNoteDto,
  ConvertLeadDto,
} from './dto';
import {
  UserRole,
  JwtPayload,
  ILead,
  ILeadActivity,
  IPaginatedResponse,
} from '@sentra-core/types';

@Controller('leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post()
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
    UserRole.FRONTSELL_AGENT,
  )
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.create(user.orgId, user.sub, dto);
  }

  @Get()
  findAll(
    @Query() query: QueryLeadsDto,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IPaginatedResponse<ILead>> {
    return this.leadsService.findAll(orgId, query);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<ILead> {
    return this.leadsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
    UserRole.FRONTSELL_AGENT,
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.update(id, user.orgId, user.sub, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.leadsService.remove(id, orgId);
  }

  @Patch(':id/status')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
    UserRole.FRONTSELL_AGENT,
  )
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.changeStatus(id, user.orgId, user.sub, dto);
  }

  @Patch(':id/assign')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.assign(id, user.orgId, user.sub, dto);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILeadActivity> {
    return this.leadsService.addNote(id, user.orgId, user.sub, dto);
  }

  @Post(':id/convert')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.convert(id, user.orgId, user.sub, dto);
  }

  @Get(':id/activities')
  getActivities(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<ILeadActivity[]> {
    return this.leadsService.getActivities(id, orgId);
  }
}
