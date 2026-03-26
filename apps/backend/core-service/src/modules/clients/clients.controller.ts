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
import { CurrentUser } from '../auth/decorators';
import { Permissions } from '../../common';
import {
  CreateClientDto,
  UpdateClientDto,
  QueryClientsDto,
  AssignClientDto,
  UpdateClientStatusDto,
  AddClientNoteDto,
} from './dto';
import {
  IClient,
  IClientActivity,
  IPaginatedResponse,
  JwtPayload,
} from '@sentra-core/types';

@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Post()
  @Permissions('sales:clients:create')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateClientDto,
  ): Promise<IClient> {
    return this.clientsService.create(user.orgId, user.sub, dto);
  }

  @Get()
  @Permissions('sales:clients:view_own')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryClientsDto,
  ): Promise<IPaginatedResponse<IClient>> {
    return this.clientsService.findAll(user.orgId, query, user.sub, user.role);
  }

  @Get(':id')
  @Permissions('sales:clients:view_own')
  findOne(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IClient> {
    return this.clientsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Permissions('sales:clients:edit')
  update(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<IClient> {
    return this.clientsService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Permissions('sales:clients:delete')
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.clientsService.remove(id, orgId);
  }

  @Patch(':id/assign')
  @Permissions('sales:clients:assign')
  assign(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignClientDto,
  ): Promise<IClient> {
    return this.clientsService.assign(id, user.orgId, user.sub, dto);
  }

  @Patch(':id/status')
  @Permissions('sales:clients:status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateClientStatusDto,
  ): Promise<IClient> {
    return this.clientsService.updateStatus(id, user.orgId, user.sub, dto.status);
  }

  @Post(':id/notes')
  @Permissions('sales:clients:note')
  addNote(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddClientNoteDto,
  ): Promise<IClientActivity> {
    return this.clientsService.addNote(id, user.orgId, user.sub, dto.content, dto.mentionedUserIds);
  }

  @Post(':id/grant-portal-access')
  @Permissions('sales:clients:portal')
  grantPortalAccess(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.clientsService.grantPortalAccess(id, user.orgId, user.sub);
  }

  @Post(':id/revoke-portal-access')
  @Permissions('sales:clients:portal')
  revokePortalAccess(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    return this.clientsService.revokePortalAccess(id, user.orgId, user.sub);
  }
}
