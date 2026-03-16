import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AppCode, IFacebookIntegration, JwtPayload, UserRole } from '@sentra-core/types';
import { AppAccess, CurrentUser, Roles } from '../auth/decorators';
import {
  CreateFacebookIntegrationDto,
  UpdateFacebookIntegrationDto,
} from './dto';
import { LeadIntegrationsService } from './lead-integrations.service';

@Controller('integrations/facebook')
@AppAccess(AppCode.SALES_DASHBOARD)
export class LeadIntegrationsController {
  constructor(private readonly leadIntegrationsService: LeadIntegrationsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  list(@CurrentUser('orgId') orgId: string): Promise<IFacebookIntegration[]> {
    return this.leadIntegrationsService.listFacebookIntegrations(orgId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFacebookIntegrationDto,
  ): Promise<IFacebookIntegration> {
    return this.leadIntegrationsService.createFacebookIntegration(user.orgId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateFacebookIntegrationDto,
  ): Promise<IFacebookIntegration> {
    return this.leadIntegrationsService.updateFacebookIntegration(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.leadIntegrationsService.removeFacebookIntegration(id, orgId);
  }
}
