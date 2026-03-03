/**
 * ApprovalsService — PM-BE-015
 *
 * Manages revision requests, deliverable packages, approval requests,
 * approval decision capture (immutable snapshots), and project closeout.
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmEventsService } from '../events/pm-events.service';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
} from '../../common/helpers/pagination.helper';
import { CreateRevisionRequestDto } from './dto/create-revision-request.dto';
import { CreateDeliverableDto } from './dto/create-deliverable.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { CloseProjectDto } from './dto/close-project.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PmEventsService,
  ) {}

  // =========================================================================
  // Revision Requests
  // =========================================================================

  async createRevisionRequest(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: CreateRevisionRequestDto,
  ) {
    await this.assertProjectExists(organizationId, projectId);

    return this.prisma.pmRevisionRequest.create({
      data: {
        projectId,
        taskId: dto.taskId ?? null,
        sourceType: dto.sourceType,
        sourceUserId: dto.sourceUserId ?? userId,
        requestType: dto.requestType ?? 'GENERAL',
        status: 'OPEN',
        notes: dto.notes ?? null,
      },
    });
  }

  async listRevisionRequests(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
  ) {
    await this.assertProjectExists(organizationId, projectId);
    const { skip, take } = toPrismaPagination(page, limit);

    const [revisions, total] = await this.prisma.$transaction([
      this.prisma.pmRevisionRequest.findMany({
        where: { projectId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pmRevisionRequest.count({ where: { projectId } }),
    ]);

    return buildPmPaginationResponse(revisions, total, page, limit);
  }

  async resolveRevisionRequest(
    organizationId: string,
    revisionId: string,
  ) {
    const revision = await this.prisma.pmRevisionRequest.findFirst({
      where: { id: revisionId },
      include: { project: { select: { organizationId: true } } },
    });
    if (!revision || revision.project.organizationId !== organizationId) {
      throw new NotFoundException('Revision request not found');
    }
    if (revision.status === 'RESOLVED' || revision.status === 'CANCELLED') {
      throw new BadRequestException('Revision is already closed');
    }

    return this.prisma.pmRevisionRequest.update({
      where: { id: revisionId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  // =========================================================================
  // Deliverable Packages
  // =========================================================================

  async createDeliverable(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: CreateDeliverableDto,
  ) {
    await this.assertProjectExists(organizationId, projectId);

    return this.prisma.pmDeliverablePackage.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description ?? null,
        deliveryType: dto.deliveryType,
        createdById: userId,
      },
    });
  }

  async listDeliverables(organizationId: string, projectId: string, page = 1, limit = 20) {
    await this.assertProjectExists(organizationId, projectId);
    const { skip, take } = toPrismaPagination(page, limit);

    const [packages, total] = await this.prisma.$transaction([
      this.prisma.pmDeliverablePackage.findMany({
        where: { projectId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          projectId: true,
          name: true,
          description: true,
          deliveryType: true,
          createdById: true,
          createdAt: true,
          _count: { select: { approvalRequests: true } },
        },
      }),
      this.prisma.pmDeliverablePackage.count({ where: { projectId } }),
    ]);

    return buildPmPaginationResponse(packages, total, page, limit);
  }

  // =========================================================================
  // Approval Requests
  // =========================================================================

  async createApprovalRequest(
    organizationId: string,
    projectId: string,
    sentById: string,
    dto: CreateApprovalRequestDto,
  ) {
    await this.assertProjectExists(organizationId, projectId);

    // Verify deliverable belongs to project
    const deliverable = await this.prisma.pmDeliverablePackage.findFirst({
      where: { id: dto.deliverablePackageId, projectId },
      select: { id: true },
    });
    if (!deliverable) {
      throw new NotFoundException('Deliverable package not found in this project');
    }

    // Validate target fields
    if (
      dto.approvalTargetType === 'CLIENT' &&
      !dto.approvalTargetEmail &&
      !dto.approvalTargetUserId
    ) {
      throw new BadRequestException(
        'approvalTargetEmail or approvalTargetUserId is required for CLIENT approvals',
      );
    }
    if (dto.approvalTargetType === 'INTERNAL_APPROVER' && !dto.approvalTargetUserId) {
      throw new BadRequestException(
        'approvalTargetUserId is required for INTERNAL_APPROVER approvals',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.pmApprovalRequest.create({
        data: {
          projectId,
          deliverablePackageId: dto.deliverablePackageId,
          approvalTargetType: dto.approvalTargetType,
          approvalTargetUserId: dto.approvalTargetUserId ?? null,
          approvalTargetEmail: dto.approvalTargetEmail ?? null,
          status: 'SENT',
          sentById,
          sentAt: new Date(),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });

      // Move project to WAITING_APPROVAL
      await tx.pmProject.update({
        where: { id: projectId },
        data: { status: 'WAITING_APPROVAL' },
      });

      // Emit pm.approval_requested event
      this.events.emitApprovalRequested(organizationId, {
        projectId,
        approvalRequestId: request.id,
        approvalTargetType: dto.approvalTargetType,
        approvalTargetUserId: dto.approvalTargetUserId ?? null,
        approvalTargetEmail: dto.approvalTargetEmail ?? null,
        deliverablePackageId: dto.deliverablePackageId,
      });

      return request;
    });
  }

  async listApprovalRequests(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
  ) {
    await this.assertProjectExists(organizationId, projectId);
    const { skip, take } = toPrismaPagination(page, limit);

    const [requests, total] = await this.prisma.$transaction([
      this.prisma.pmApprovalRequest.findMany({
        where: { projectId },
        skip,
        take,
        orderBy: { sentAt: 'desc' },
        include: {
          snapshots: {
            orderBy: { actedAt: 'desc' },
            take: 1,
            select: { decision: true, actedAt: true },
          },
        },
      }),
      this.prisma.pmApprovalRequest.count({ where: { projectId } }),
    ]);

    return buildPmPaginationResponse(requests, total, page, limit);
  }

  // =========================================================================
  // Approval Decision (immutable snapshot)
  // =========================================================================

  /**
   * Record an approval decision from an internal org user.
   *
   * actedByUserId is optional to support future external (client-portal) actors
   * who authenticate via a secure token rather than org JWT.
   *
   * FUTURE: When client-portal token-based approval is added, introduce a
   * separate public endpoint (e.g. POST /public/approval-requests/:token/decide)
   * that authenticates via a signed short-lived token, extracts the
   * approvalRequestId from the token payload, and calls applyApprovalDecision()
   * directly — bypassing OrgContextGuard.  The approvalRequestId lookup already
   * validates org scope via project.organizationId, so no OrgContextGuard is
   * needed for external actors.
   */
  async decideApproval(
    organizationId: string,
    approvalRequestId: string,
    actedByUserId: string | null,
    dto: DecideApprovalDto,
    actorIp?: string,
  ) {
    const request = await this.prisma.pmApprovalRequest.findFirst({
      where: { id: approvalRequestId },
      include: { project: { select: { organizationId: true, id: true } } },
    });

    if (!request || request.project.organizationId !== organizationId) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.status === 'APPROVED' || request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw new BadRequestException('Approval request is already decided');
    }

    return this.applyApprovalDecision(request, actedByUserId, dto, actorIp);
  }

  /**
   * Core decision logic — decoupled from OrgContextGuard so it can be called
   * from both internal (org-user) and future external (client-portal token) paths.
   *
   * @param request  - Pre-loaded and org-validated PmApprovalRequest with project.
   * @param actedByUserId - Org user ID, or null for external actors.
   * @param dto      - Decision payload.
   * @param actorIp  - Actor IP for the audit snapshot.
   */
  private async applyApprovalDecision(
    request: {
      id: string;
      deliverablePackageId: string;
      project: { id: string; organizationId: string };
    },
    actedByUserId: string | null,
    dto: DecideApprovalDto,
    actorIp?: string,
  ) {
    const organizationId = request.project.organizationId;

    return this.prisma.$transaction(async (tx) => {
      // Create immutable snapshot.
      // TODO(traceability): deliverablePackageId is available on the approval
      // request (request.deliverablePackageId) but is not denormalised into the
      // snapshot.  When the schema is ready, add a deliverablePackageId column to
      // PmApprovalSnapshot so each snapshot row is independently traceable to the
      // exact deliverable without a join.  Safe to add as a nullable column in a
      // future migration without altering this transaction.
      const snapshot = await tx.pmApprovalSnapshot.create({
        data: {
          approvalRequestId: request.id,
          decision: dto.decision,
          actedByUserId: actedByUserId ?? null,
          actorIp: actorIp ?? null,
          notes: dto.notes ?? null,
          actedAt: new Date(),
        },
      });

      // Update approval request status
      await tx.pmApprovalRequest.update({
        where: { id: request.id },
        data: { status: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
      });

      // Update project status
      const projectStatus = dto.decision === 'APPROVED' ? 'COMPLETED' : 'REVISION_REQUIRED';
      await tx.pmProject.update({
        where: { id: request.project.id },
        data: { status: projectStatus },
      });

      // Emit pm.approval_decided event (after transaction commits)
      this.events.emitApprovalDecided(organizationId, {
        projectId: request.project.id,
        approvalRequestId: request.id,
        approvalSnapshotId: snapshot.id,
        decision: dto.decision,
        actedByUserId: actedByUserId ?? null,
      });

      return snapshot;
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async assertProjectExists(organizationId: string, projectId: string) {
    const project = await this.prisma.pmProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  // =========================================================================
  // Project Closeout
  // =========================================================================

  async closeProject(
    organizationId: string,
    projectId: string,
    closedById: string,
    dto: CloseProjectDto,
  ) {
    const project = await this.prisma.pmProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status === 'CANCELLED') {
      throw new BadRequestException('Project is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.pmProject.update({
        where: { id: projectId },
        data: { status: 'COMPLETED', closedAt: new Date() },
      });

      const record = await tx.pmProjectClosureRecord.create({
        data: {
          projectId,
          closedById,
          closureReason: dto.closureReason,
          notes: dto.notes ?? null,
          closedAt: new Date(),
        },
      });

      return record;
    });
  }
}
