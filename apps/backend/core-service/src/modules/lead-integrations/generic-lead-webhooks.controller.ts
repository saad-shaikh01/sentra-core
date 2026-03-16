import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AppCode, IGenericLeadWebhook, JwtPayload, UserRole } from '@sentra-core/types';
import { AppAccess, CurrentUser, Roles } from '../auth/decorators';
import {
  CreateGenericLeadWebhookDto,
  UpdateGenericLeadWebhookDto,
} from './dto';
import { LeadIntegrationsService } from './lead-integrations.service';

@Controller('integrations/inbound-webhooks')
@AppAccess(AppCode.SALES_DASHBOARD)
export class GenericLeadWebhooksController {
  constructor(private readonly leadIntegrationsService: LeadIntegrationsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  list(@CurrentUser('orgId') orgId: string): Promise<IGenericLeadWebhook[]> {
    return this.leadIntegrationsService.listGenericLeadWebhooks(orgId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGenericLeadWebhookDto,
  ): Promise<IGenericLeadWebhook> {
    return this.leadIntegrationsService.createGenericLeadWebhook(user.orgId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateGenericLeadWebhookDto,
  ): Promise<IGenericLeadWebhook> {
    return this.leadIntegrationsService.updateGenericLeadWebhook(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.leadIntegrationsService.removeGenericLeadWebhook(id, orgId);
  }
}
