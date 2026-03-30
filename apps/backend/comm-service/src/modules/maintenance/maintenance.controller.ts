import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { wrapSingle } from '../../common/response/comm-api-response';
import { BackfillIntelligenceDto } from './dto/backfill-intelligence.dto';
import { MaintenanceService } from './maintenance.service';

@UseGuards(OrgContextGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('backfill-intelligence')
  async backfillIntelligence(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: BackfillIntelligenceDto,
  ) {
    const job = await this.maintenanceService.queueIntelligenceBackfill(
      ctx.organizationId,
      ctx.userId,
      ctx.userRole as UserRole,
      dto.batchSize,
    );
    return wrapSingle(job);
  }

  @Get('jobs/:jobId')
  async getJobStatus(
    @GetOrgContext() ctx: OrgContext,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.maintenanceService.getJobStatus(
      ctx.organizationId,
      ctx.userRole as UserRole,
      jobId,
    );
    if (!job) {
      throw new NotFoundException(`Maintenance job ${jobId} not found`);
    }
    return wrapSingle(job);
  }
}
