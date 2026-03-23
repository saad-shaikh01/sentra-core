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
import { ClientsService } from './clients.service';
import { Roles, CurrentUser } from '../auth/decorators';
import {
  CreateClientDto,
  UpdateClientDto,
  QueryClientsDto,
  AssignClientDto,
  UpdateClientStatusDto,
  AddClientNoteDto,
} from './dto';
import {
  UserRole,
  IClient,
  IClientActivity,
  IPaginatedResponse,
  JwtPayload,
} from '@sentra-core/types';

@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateClientDto,
  ): Promise<IClient> {
    return this.clientsService.create(user.orgId, user.sub, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryClientsDto,
  ): Promise<IPaginatedResponse<IClient>> {
    return this.clientsService.findAll(user.orgId, query, user.sub, user.role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IClient> {
    return this.clientsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  update(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<IClient> {
    return this.clientsService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.clientsService.remove(id, orgId);
  }

  @Patch(':id/assign')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  assign(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignClientDto,
  ): Promise<IClient> {
    return this.clientsService.assign(id, user.orgId, user.sub, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateClientStatusDto,
  ): Promise<IClient> {
    return this.clientsService.updateStatus(id, user.orgId, user.sub, dto.status);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddClientNoteDto,
  ): Promise<IClientActivity> {
    return this.clientsService.addNote(id, user.orgId, user.sub, dto.content, dto.mentionedUserIds);
  }

  @Post(':id/grant-portal-access')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  grantPortalAccess(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.clientsService.grantPortalAccess(id, user.orgId, user.sub);
  }

  @Post(':id/revoke-portal-access')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  revokePortalAccess(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.clientsService.revokePortalAccess(id, user.orgId, user.sub);
  }
}
