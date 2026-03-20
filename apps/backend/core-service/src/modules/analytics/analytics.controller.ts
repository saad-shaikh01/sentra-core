import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../auth/decorators';
import { IAnalyticsSummary, UserRole } from '@sentra-core/types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(
    @CurrentUser('orgId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
  ): Promise<IAnalyticsSummary> {
    return this.analyticsService.getSummary(orgId, userId, role);
  }
}
