import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { ReportsService } from './reports.service';

@UseGuards(OrgContextGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('project-health')
  async projectHealth(@GetOrgContext() ctx: OrgContext) {
    return this.service.getProjectHealth(ctx.organizationId);
  }

  @Get('sla-breaches')
  async slaBreaches(
    @GetOrgContext() ctx: OrgContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSlaBreaches(
      ctx.organizationId,
      page ? +page : 1,
      limit ? +limit : 20,
    );
  }

  @Get('team-performance')
  async teamPerformance(@GetOrgContext() ctx: OrgContext) {
    return this.service.getTeamPerformance(ctx.organizationId);
  }

  @Get('engagement-financials')
  async engagementFinancials(@GetOrgContext() ctx: OrgContext) {
    return this.service.getEngagementFinancials(ctx.organizationId);
  }

  @Patch('escalations/:id/resolve')
  async resolveEscalation(@GetOrgContext() ctx: OrgContext, @Param('id') id: string) {
    return this.service.resolveEscalation(ctx.organizationId, id);
  }
}
