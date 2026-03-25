import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  PayloadTooLargeException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { Roles, CurrentUser, Public, AppAccess } from '../auth/decorators';
import { Permissions } from '../../common';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeStatusDto,
  AssignLeadDto,
  AddNoteDto,
  ConvertLeadDto,
  CaptureLeadDto,
  ImportLeadsDto,
  AddCollaboratorDto,
} from './dto';
import {
  UserRole,
  AppCode,
  JwtPayload,
  ILead,
  ILeadActivity,
  ILeadCollaborator,
  ILeadImportResult,
  IPaginatedResponse,
} from '@sentra-core/types';

const ALLOWED_IMPORT_EXTENSIONS = ['.csv', '.xlsx'];
const ALLOWED_IMPORT_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
type LeadImportFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('leads')
@AppAccess(AppCode.SALES_DASHBOARD)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post('capture')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  capture(
    @Body() dto: CaptureLeadDto,
  ): Promise<{ id: string; message: string }> {
    return this.leadsService.capture(dto);
  }

  @Post('import')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async importLeads(
    @UploadedFile() file: LeadImportFile | undefined,
    @Body() dto: ImportLeadsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILeadImportResult> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > MAX_IMPORT_SIZE) {
      throw new PayloadTooLargeException('File too large. Maximum 5 MB');
    }

    const extension = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '';
    if (!ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
      throw new BadRequestException('Only CSV and XLSX files are allowed');
    }

    if (file.mimetype && !ALLOWED_IMPORT_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }

    return this.leadsService.import(user.orgId, user.sub, dto, file);
  }

  @Post()
  @Permissions('sales:leads:create')
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.create(user.orgId, user.sub, user.role, dto);
  }

  @Get()
  findAll(
    @Query() query: QueryLeadsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<IPaginatedResponse<ILead>> {
    return this.leadsService.findAll(user.orgId, query, user.sub, user.role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<ILead> {
    return this.leadsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Permissions('sales:leads:edit_own')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.update(id, user.orgId, user.sub, dto);
  }

  @Delete(':id')
  @Permissions('sales:leads:delete')
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
  @Permissions('sales:leads:assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.assign(id, user.orgId, user.sub, dto);
  }

  @Post(':id/claim')
  @Roles(
    UserRole.FRONTSELL_AGENT,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
    UserRole.OWNER,
  )
  claim(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.claim(id, user.orgId, user.sub);
  }

  @Post(':id/unclaim')
  @Roles(
    UserRole.FRONTSELL_AGENT,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
    UserRole.OWNER,
  )
  unclaim(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILead> {
    return this.leadsService.unclaim(id, user.orgId, user.sub, user.role);
  }

  @Post(':id/collaborators')
  @Roles(
    UserRole.FRONTSELL_AGENT,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
    UserRole.OWNER,
  )
  addCollaborator(
    @Param('id') id: string,
    @Body() dto: AddCollaboratorDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILeadCollaborator> {
    return this.leadsService.addCollaborator(id, user.orgId, user.sub, dto.userId);
  }

  @Delete(':id/collaborators/:userId')
  @Roles(
    UserRole.FRONTSELL_AGENT,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
    UserRole.OWNER,
  )
  removeCollaborator(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.leadsService.removeCollaborator(id, user.orgId, user.sub, targetUserId);
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

  @Get('teams/:teamId/stats')
  @Permissions('sales:teams:view')
  getTeamStats(
    @Param('teamId') teamId: string,
    @Query('period') period: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{
    teamId: string;
    period: string;
    totalLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: string;
    totalSales: number;
    totalRevenue: number;
  }> {
    return this.leadsService.getTeamStats(teamId, orgId, period ?? 'this_month');
  }

  @Delete(':id/notes/:activityId')
  deleteNote(
    @Param('id') leadId: string,
    @Param('activityId') activityId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.leadsService.deleteNote(leadId, activityId, user.orgId, user.sub);
  }

  @Patch(':id/notes/:activityId')
  editNote(
    @Param('id') leadId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ILeadActivity> {
    return this.leadsService.editNote(leadId, activityId, user.orgId, user.sub, dto);
  }
}
