import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import * as crypto from 'crypto';
import { CreatePortalAccessDto } from './dto/create-portal-access.dto';

@Injectable()
export class ClientPortalService {
  constructor(private readonly prisma: PrismaService) {}

  async createAccess(organizationId: string, createdById: string, dto: CreatePortalAccessDto) {
    const project = await this.prisma.pmProject.findFirst({
      where: { id: dto.projectId, organizationId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const token = crypto.randomBytes(32).toString('hex');
    const access = await this.prisma.pmClientPortalAccess.create({
      data: {
        organizationId,
        projectId: dto.projectId,
        email: dto.email,
        clientId: dto.clientId ?? null,
        token,
        expiresAt: dto.expiresAt
          ? new Date(dto.expiresAt)
          : new Date(Date.now() + 72 * 60 * 60 * 1000),
        isActive: true,
        createdById,
      },
    });

    return { ...access, portalUrl: `/portal/${token}` };
  }

  async validateToken(token: string) {
    const access = await this.prisma.pmClientPortalAccess.findUnique({
      where: { token },
    });
    if (!access || !access.isActive) {
      throw new UnauthorizedException('Invalid or inactive portal token');
    }
    if (access.expiresAt && access.expiresAt < new Date()) {
      throw new UnauthorizedException('Portal token has expired');
    }
    return access;
  }

  async getProject(token: string) {
    const access = await this.validateToken(token);
    const project = await this.prisma.pmProject.findFirst({
      where: { id: access.projectId },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            sortOrder: true,
            dueAt: true,
            departmentCode: true,
          },
        },
        engagement: { select: { name: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return { project, clientEmail: access.email };
  }

  async getDeliverables(token: string) {
    const access = await this.validateToken(token);
    return this.prisma.pmDeliverablePackage.findMany({
      where: { projectId: access.projectId },
      include: {
        items: true,
        approvalRequests: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
    });
  }

  async respondToApproval(
    token: string,
    approvalId: string,
    dto: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
  ) {
    const access = await this.validateToken(token);
    const approval = await this.prisma.pmApprovalRequest.findFirst({
      where: { id: approvalId, projectId: access.projectId },
    });
    if (!approval) throw new NotFoundException('Approval request not found');

    await this.prisma.$transaction([
      this.prisma.pmApprovalSnapshot.create({
        data: {
          approvalRequestId: approvalId,
          decision: dto.decision,
          notes: dto.notes ?? null,
        },
      }),
      this.prisma.pmApprovalRequest.update({
        where: { id: approvalId },
        data: { status: dto.decision },
      }),
    ]);

    return { success: true };
  }

  async getThreads(token: string) {
    const access = await this.validateToken(token);
    return this.prisma.pmConversationThread.findMany({
      where: { projectId: access.projectId, visibility: 'EXTERNAL' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, body: true, createdAt: true, authorId: true },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async postMessage(token: string, threadId: string, body: string) {
    const access = await this.validateToken(token);
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, projectId: access.projectId, visibility: 'EXTERNAL' },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    return this.prisma.pmMessage.create({
      data: {
        threadId,
        authorId: `client:${access.email}`,
        body,
        messageType: 'COMMENT',
      },
    });
  }

  async revokeAccess(organizationId: string, accessId: string) {
    const access = await this.prisma.pmClientPortalAccess.findFirst({
      where: { id: accessId, organizationId },
    });
    if (!access) throw new NotFoundException('Portal access not found');
    return this.prisma.pmClientPortalAccess.update({
      where: { id: accessId },
      data: { isActive: false },
    });
  }
}
