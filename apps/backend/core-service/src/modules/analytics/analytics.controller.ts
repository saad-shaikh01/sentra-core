import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../auth/decorators';
import { IAnalyticsSummary, IAnalyticsFilter, UserRole } from '@sentra-core/types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(
    @CurrentUser('orgId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('preset') preset?: string,
    @Query('granularity') granularity?: string,
    @Query('compareMode') compareMode?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ): Promise<IAnalyticsSummary> {
    const filters: IAnalyticsFilter = {
      ...(fromDate && { fromDate }),
      ...(toDate && { toDate }),
      ...(preset && { preset: preset as IAnalyticsFilter['preset'] }),
      ...(granularity && { granularity: granularity as IAnalyticsFilter['granularity'] }),
      ...(compareMode && { compareMode: compareMode as IAnalyticsFilter['compareMode'] }),
      ...(month && { month }),
      ...(year && { year }),
    };
    return this.analyticsService.getSummary(orgId, userId, role, filters);
  }
}
