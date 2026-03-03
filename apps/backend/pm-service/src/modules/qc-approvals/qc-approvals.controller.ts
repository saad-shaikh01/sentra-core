/**
 * QcApprovalsController — PM-BE-013, PM-BE-014, PM-BE-015
 *
 * Routes (global prefix /api/pm):
 *
 *   Submissions (PM-BE-013):
 *   POST   /api/pm/tasks/:taskId/submissions          — create submission + self-QC
 *   GET    /api/pm/tasks/:taskId/submissions          — list submissions for task
 *   GET    /api/pm/submissions/:id                    — submission detail
 *
 *   QC Reviews (PM-BE-014):
 *   POST   /api/pm/submissions/:id/qc-reviews         — submit QC review
 *   POST   /api/pm/tasks/:taskId/bypass               — bypass QC with reason
 *   GET    /api/pm/projects/:projectId/bypasses       — list bypass records (audit)
 *
 *   Revisions, Deliverables, Approvals (PM-BE-015):
 *   POST   /api/pm/projects/:projectId/revisions            — create revision request
 *   GET    /api/pm/projects/:projectId/revisions            — list revision requests
 *   POST   /api/pm/revisions/:id/resolve                    — resolve revision
 *   POST   /api/pm/projects/:projectId/deliverables         — create deliverable package
 *   GET    /api/pm/projects/:projectId/deliverables         — list deliverables
 *   POST   /api/pm/projects/:projectId/approval-requests    — create approval request
 *   GET    /api/pm/projects/:projectId/approval-requests    — list approval requests
 *   POST   /api/pm/approval-requests/:id/decide             — record approval decision
 *   POST   /api/pm/projects/:projectId/close                — close project
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { SubmissionsService } from './submissions.service';
import { QcReviewsService } from './qc-reviews.service';
import { ApprovalsService } from './approvals.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { CreateQcReviewDto } from './dto/create-qc-review.dto';
import { CreateBypassDto } from './dto/create-bypass.dto';
import { CreateRevisionRequestDto } from './dto/create-revision-request.dto';
import { CreateDeliverableDto } from './dto/create-deliverable.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { CloseProjectDto } from './dto/close-project.dto';

@UseGuards(OrgContextGuard)
@Controller()
export class QcApprovalsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly qcReviewsService: QcReviewsService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  // =========================================================================
  // Submissions (PM-BE-013)
  // =========================================================================

  @Post('tasks/:taskId/submissions')
  @HttpCode(HttpStatus.CREATED)
  async createSubmission(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubmissionDto,
  ) {
    const submission = await this.submissionsService.create(
      ctx.organizationId,
      taskId,
      ctx.userId,
      dto,
    );
    return wrapSingle(submission);
  }

  @Get('tasks/:taskId/submissions')
  async listSubmissions(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.submissionsService.list(
      ctx.organizationId,
      taskId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get('submissions/:id')
  async findSubmission(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const submission = await this.submissionsService.findOne(ctx.organizationId, id);
    return wrapSingle(submission);
  }

  @Get('submissions/queue/all')
  async listReviewQueue(
    @GetOrgContext() ctx: OrgContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.submissionsService.listQueue(
      ctx.organizationId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  // =========================================================================
  // QC Reviews (PM-BE-014)
  // =========================================================================

  @Post('submissions/:id/qc-reviews')
  @HttpCode(HttpStatus.CREATED)
  async createQcReview(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') submissionId: string,
    @Body() dto: CreateQcReviewDto,
  ) {
    const review = await this.qcReviewsService.createReview(
      ctx.organizationId,
      submissionId,
      ctx.userId,
      dto,
    );
    return wrapSingle(review);
  }

  @Post('tasks/:taskId/bypass')
  @HttpCode(HttpStatus.CREATED)
  async createBypass(
    @GetOrgContext() ctx: OrgContext,
    @Param('taskId') taskId: string,
    @Body() dto: CreateBypassDto,
  ) {
    const bypass = await this.qcReviewsService.createBypass(
      ctx.organizationId,
      taskId,
      ctx.userId,
      dto,
    );
    return wrapSingle(bypass);
  }

  @Get('projects/:projectId/bypasses')
  async listBypasses(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
  ) {
    const bypasses = await this.qcReviewsService.listBypassRecords(
      ctx.organizationId,
      projectId,
    );
    return wrapSingle(bypasses);
  }

  // =========================================================================
  // Revisions (PM-BE-015)
  // =========================================================================

  @Post('projects/:projectId/revisions')
  @HttpCode(HttpStatus.CREATED)
  async createRevision(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRevisionRequestDto,
  ) {
    const revision = await this.approvalsService.createRevisionRequest(
      ctx.organizationId,
      projectId,
      ctx.userId,
      dto,
    );
    return wrapSingle(revision);
  }

  @Get('projects/:projectId/revisions')
  async listRevisions(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.approvalsService.listRevisionRequests(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Post('revisions/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveRevision(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const revision = await this.approvalsService.resolveRevisionRequest(
      ctx.organizationId,
      id,
    );
    return wrapSingle(revision);
  }

  // =========================================================================
  // Deliverables (PM-BE-015)
  // =========================================================================

  @Post('projects/:projectId/deliverables')
  @HttpCode(HttpStatus.CREATED)
  async createDeliverable(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDeliverableDto,
  ) {
    const deliverable = await this.approvalsService.createDeliverable(
      ctx.organizationId,
      projectId,
      ctx.userId,
      dto,
    );
    return wrapSingle(deliverable);
  }

  @Get('projects/:projectId/deliverables')
  async listDeliverables(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.approvalsService.listDeliverables(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  // =========================================================================
  // Approval Requests (PM-BE-015)
  // =========================================================================

  @Post('projects/:projectId/approval-requests')
  @HttpCode(HttpStatus.CREATED)
  async createApprovalRequest(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Body() dto: CreateApprovalRequestDto,
  ) {
    const request = await this.approvalsService.createApprovalRequest(
      ctx.organizationId,
      projectId,
      ctx.userId,
      dto,
    );
    return wrapSingle(request);
  }

  @Get('projects/:projectId/approval-requests')
  async listApprovalRequests(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.approvalsService.listApprovalRequests(
      ctx.organizationId,
      projectId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Post('approval-requests/:id/decide')
  @HttpCode(HttpStatus.OK)
  async decideApproval(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @Req() req: Request,
  ) {
    const actorIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined;

    const snapshot = await this.approvalsService.decideApproval(
      ctx.organizationId,
      id,
      ctx.userId,
      dto,
      actorIp,
    );
    return wrapSingle(snapshot);
  }

  // =========================================================================
  // Project Closeout (PM-BE-015)
  // =========================================================================

  @Post('projects/:projectId/close')
  @HttpCode(HttpStatus.OK)
  async closeProject(
    @GetOrgContext() ctx: OrgContext,
    @Param('projectId') projectId: string,
    @Body() dto: CloseProjectDto,
  ) {
    const record = await this.approvalsService.closeProject(
      ctx.organizationId,
      projectId,
      ctx.userId,
      dto,
    );
    return wrapSingle(record);
  }
}
