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
  UpdateCredentialsDto,
} from './dto';
import { UserRole, IClient, IPaginatedResponse, JwtPayload } from '@sentra-core/types';

@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  create(
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateClientDto,
  ): Promise<IClient> {
    return this.clientsService.create(orgId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('orgId') orgId: string,
    @Query() query: QueryClientsDto,
  ): Promise<IPaginatedResponse<IClient>> {
    return this.clientsService.findAll(orgId, query);
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

  @Patch(':id/credentials')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateCredentials(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateCredentialsDto,
  ): Promise<{ message: string }> {
    return this.clientsService.updateCredentials(id, orgId, dto);
  }
}
