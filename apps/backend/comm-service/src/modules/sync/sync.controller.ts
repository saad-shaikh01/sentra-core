import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommSyncJob, CommSyncJobDocument } from '../../schemas/comm-sync-job.schema';
import { SyncService } from './sync.service';
import { IsOptional, IsString } from 'class-validator';
import { CommPaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';
import { wrapSingle, COMM_MUTATION_OK } from '../../common/response/comm-api-response';

class ListSyncJobsQueryDto extends CommPaginationQueryDto {
  @IsOptional() @IsString() identityId?: string;
  @IsOptional() @IsString() status?: string;
}

@UseGuards(OrgContextGuard)
@Controller('sync')
export class SyncController {
  constructor(
    @InjectModel(CommSyncJob.name)
    private readonly syncJobModel: Model<CommSyncJobDocument>,
    private readonly syncService: SyncService,
  ) {}

  /**
   * Manually trigger incremental sync for an identity.
   */
  @Post(':identityId/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerSync(
    @GetOrgContext() ctx: OrgContext,
    @Param('identityId') identityId: string,
    @Req() req: Request,
  ) {
    await this.syncService.triggerIncrementalSyncForIdentity(
      identityId,
      ctx.organizationId,
      req.requestId,
    );
    return COMM_MUTATION_OK;
  }

  /**
   * List sync job records.
   */
  @Get('jobs')
  async listJobs(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: ListSyncJobsQueryDto,
  ) {
    const { identityId, status, page = 1, limit = 20 } = query;
    const filter: Record<string, any> = { organizationId: ctx.organizationId };
    if (identityId) filter.identityId = identityId;
    if (status) filter.status = status;

    const { skip } = toMongoosePagination(page, limit);
    const [data, total] = await Promise.all([
      this.syncJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.syncJobModel.countDocuments(filter),
    ]);

    return buildCommPaginationResponse(data, total, page, limit);
  }

  /**
   * List DLQ jobs.
   */
  @Get('dlq')
  async listDlq(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: CommPaginationQueryDto,
  ) {
    const { page = 1, limit = 20 } = query;
    const { skip } = toMongoosePagination(page, limit);

    const [data, total] = await Promise.all([
      this.syncJobModel
        .find({ organizationId: ctx.organizationId, status: 'dlq' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.syncJobModel.countDocuments({ organizationId: ctx.organizationId, status: 'dlq' }),
    ]);

    return buildCommPaginationResponse(data, total, page, limit);
  }

  /**
   * Re-queue a DLQ job.
   */
  @Post('dlq/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  async retryDlqJob(
    @GetOrgContext() ctx: OrgContext,
    @Param('jobId') jobId: string,
    @Req() req: Request,
  ) {
    const job = await this.syncJobModel.findOne({
      _id: jobId,
      organizationId: ctx.organizationId,
      status: 'dlq',
    });

    if (!job) {
      return { success: false, message: 'DLQ job not found' };
    }

    await this.syncService.triggerInitialSync(job.identityId, req.requestId);
    await this.syncJobModel.findByIdAndUpdate(jobId, { $set: { status: 'pending' } });

    return COMM_MUTATION_OK;
  }
}
