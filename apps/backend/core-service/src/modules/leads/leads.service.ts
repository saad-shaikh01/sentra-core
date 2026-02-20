import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import * as bcrypt from 'bcryptjs';
import {
  LeadStatus,
  LeadActivityType,
  LEAD_STATUS_TRANSITIONS,
  ILead,
  ILeadActivity,
  IPaginatedResponse,
} from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeStatusDto,
  AssignLeadDto,
  AddNoteDto,
  ConvertLeadDto,
} from './dto';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    dto: CreateLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.create({
      data: {
        title: dto.title,
        source: dto.source,
        data: (dto.data as any) ?? undefined,
        status: LeadStatus.NEW,
        brandId: dto.brandId,
        organizationId: orgId,
        assignedToId: dto.assignedToId,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.CREATED,
        data: { title: lead.title },
        leadId: lead.id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return {
      id: lead.id,
      title: lead.title,
      status: lead.status as LeadStatus,
      source: lead.source,
      data: lead.data as Record<string, unknown>,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId,
      convertedClientId: lead.convertedClientId,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  async findAll(
    orgId: string,
    query: QueryLeadsDto,
  ): Promise<IPaginatedResponse<ILead>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `leads:${orgId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<ILead>>(cacheKey);
    if (cached) return cached;

    const { page, limit, status, source, assignedToId, brandId, dateFrom, dateTo, search } = query;

    const where: any = { organizationId: orgId };

    if (status) {
      where.status = status;
    }

    if (source) {
      where.source = source;
    }

    if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const data: ILead[] = leads.map((lead) => ({
      id: lead.id,
      title: lead.title,
      status: lead.status as LeadStatus,
      source: lead.source,
      data: lead.data as Record<string, unknown>,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId,
      convertedClientId: lead.convertedClientId,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    }));

    const result = buildPaginationResponse(data, total, page, limit);
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(id: string, orgId: string): Promise<ILead & { activities: ILeadActivity[]; assignedTo?: any }> {
    const cacheKey = `leads:${orgId}:${id}`;

    const cached = await this.cache.get<ILead & { activities: ILeadActivity[]; assignedTo?: any }>(cacheKey);
    if (cached) return cached;

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        },
        assignedTo: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const result = {
      id: lead.id,
      title: lead.title,
      status: lead.status as LeadStatus,
      source: lead.source,
      data: lead.data as Record<string, unknown>,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId,
      convertedClientId: lead.convertedClientId,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      activities: lead.activities.map((a) => ({
        id: a.id,
        type: a.type as LeadActivityType,
        data: a.data as Record<string, unknown>,
        leadId: a.leadId,
        userId: a.userId,
        createdAt: a.createdAt,
      })),
      assignedTo: lead.assignedTo
        ? {
            id: lead.assignedTo.id,
            email: lead.assignedTo.email,
            name: lead.assignedTo.name,
          }
        : undefined,
    };

    await this.cache.set(cacheKey, result);
    return result;
  }

  async update(
    id: string,
    orgId: string,
    userId: string,
    dto: UpdateLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        title: dto.title,
        source: dto.source,
        data: (dto.data as any) ?? undefined,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status as LeadStatus,
      source: updated.source,
      data: updated.data as Record<string, unknown>,
      brandId: updated.brandId,
      organizationId: updated.organizationId,
      assignedToId: updated.assignedToId,
      convertedClientId: updated.convertedClientId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    await this.prisma.leadActivity.deleteMany({ where: { leadId: id } });
    await this.prisma.lead.delete({ where: { id } });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return { message: 'Lead deleted successfully' };
  }

  async changeStatus(
    id: string,
    orgId: string,
    userId: string,
    dto: ChangeStatusDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const currentStatus = lead.status as LeadStatus;
    const allowedTransitions = LEAD_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${dto.status}`,
      );
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.STATUS_CHANGE,
        data: { from: currentStatus, to: dto.status },
        leadId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status as LeadStatus,
      source: updated.source,
      data: updated.data as Record<string, unknown>,
      brandId: updated.brandId,
      organizationId: updated.organizationId,
      assignedToId: updated.assignedToId,
      convertedClientId: updated.convertedClientId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async assign(
    id: string,
    orgId: string,
    userId: string,
    dto: AssignLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignedToId },
    });

    if (!assignee) {
      throw new NotFoundException('Assignee not found');
    }

    if (assignee.organizationId !== orgId) {
      throw new BadRequestException('Assignee must be in the same organization');
    }

    const previousAssignedToId = lead.assignedToId;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.ASSIGNMENT_CHANGE,
        data: { from: previousAssignedToId, to: dto.assignedToId },
        leadId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status as LeadStatus,
      source: updated.source,
      data: updated.data as Record<string, unknown>,
      brandId: updated.brandId,
      organizationId: updated.organizationId,
      assignedToId: updated.assignedToId,
      convertedClientId: updated.convertedClientId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async addNote(
    id: string,
    orgId: string,
    userId: string,
    dto: AddNoteDto,
  ): Promise<ILeadActivity> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const activity = await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.NOTE,
        data: { content: dto.content },
        leadId: id,
        userId,
      },
    });

    // Invalidate the detail cache since activities are embedded in findOne
    await this.cache.del(`leads:${orgId}:${id}`);

    return {
      id: activity.id,
      type: activity.type as LeadActivityType,
      data: activity.data as Record<string, unknown>,
      leadId: activity.leadId,
      userId: activity.userId,
      createdAt: activity.createdAt,
    };
  }

  async convert(
    id: string,
    orgId: string,
    userId: string,
    dto: ConvertLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    if (lead.convertedClientId) {
      throw new BadRequestException('Lead has already been converted');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          companyName: dto.companyName,
          contactName: dto.contactName,
          phone: dto.phone,
          brandId: lead.brandId,
          organizationId: orgId,
        },
      });

      const updated = await tx.lead.update({
        where: { id },
        data: {
          convertedClientId: client.id,
          status: LeadStatus.CLOSED,
        },
      });

      await tx.leadActivity.create({
        data: {
          type: LeadActivityType.CONVERSION,
          data: { clientId: client.id, companyName: dto.companyName },
          leadId: id,
          userId,
        },
      });

      return updated;
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);
    await this.cache.delByPrefix(`clients:${orgId}:`);

    return {
      id: result.id,
      title: result.title,
      status: result.status as LeadStatus,
      source: result.source,
      data: result.data as Record<string, unknown>,
      brandId: result.brandId,
      organizationId: result.organizationId,
      assignedToId: result.assignedToId,
      convertedClientId: result.convertedClientId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  async getActivities(id: string, orgId: string): Promise<ILeadActivity[]> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const activities = await this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    return activities.map((a) => ({
      id: a.id,
      type: a.type as LeadActivityType,
      data: a.data as Record<string, unknown>,
      leadId: a.leadId,
      userId: a.userId,
      createdAt: a.createdAt,
    }));
  }
}
