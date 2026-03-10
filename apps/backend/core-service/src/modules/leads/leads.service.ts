import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';
import {
  LeadStatus,
  LeadActivityType,
  UserRole,
  LEAD_STATUS_TRANSITIONS,
  ILead,
  ILeadActivity,
  IPaginatedResponse,
} from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { TeamsService } from '../teams';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeStatusDto,
  AssignLeadDto,
  AddNoteDto,
  ConvertLeadDto,
  CaptureLeadDto,
} from './dto';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private teams: TeamsService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    dto: CreateLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.create({
      data: {
        title: dto.title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
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

    return this.mapToILead(lead);
  }

  async findAll(
    orgId: string,
    query: QueryLeadsDto,
    userId: string,
    role: UserRole,
  ): Promise<IPaginatedResponse<ILead>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `leads:${orgId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<ILead>>(cacheKey);
    if (cached) return cached;

    const { page, limit, status, source, assignedToId, brandId, dateFrom, dateTo, search } = query;

    const agentRoles: UserRole[] = [UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT];
    const where: Record<string, any> = { organizationId: orgId, deletedAt: null };

    // Data visibility scoping
    if (agentRoles.includes(role)) {
      where.assignedToId = userId;
    } else if (role === UserRole.SALES_MANAGER) {
      // Managers see their own agents' leads
      const memberIds = await this.teams.getMemberIds(userId, orgId);
      if (memberIds.length > 0) {
        where.assignedToId = { in: [...memberIds, userId] };
      }
    }

    if (status) {
      where.status = status;
    }

    if (source) {
      where.source = source;
    }

    if (assignedToId) {
      // Only allow admins/managers to override the agent scope
      if (!agentRoles.includes(role)) {
        where.assignedToId = assignedToId;
      }
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
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
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

    const data: ILead[] = leads.map((lead) => this.mapToILead(lead));

    const result: IPaginatedResponse<ILead> = buildPaginationResponse(
      data,
      total,
      page,
      limit,
    );
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

    if (!lead || lead.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const result = {
      ...this.mapToILead(lead),
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

    if (!lead || lead.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        title: dto.title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        source: dto.source,
        status: dto.status,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        data: (dto.data as any) ?? undefined,
        assignedToId: dto.assignedToId,
      },
    });

    await this.cache.del(`leads:${orgId}:${id}`);
    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

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

    if (!lead || lead.deletedAt) {
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

    if (dto.status === LeadStatus.FOLLOW_UP && !dto.followUpDate) {
      throw new BadRequestException(
        'followUpDate is required when transitioning to FOLLOW_UP status',
      );
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.STATUS_CHANGE,
        data: {
          from: currentStatus,
          to: dto.status,
          followUpDate: dto.followUpDate ?? null,
        },
        leadId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async assign(
    id: string,
    orgId: string,
    userId: string,
    dto: AssignLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) {
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

    return this.mapToILead(updated);
  }

  async addNote(
    id: string,
    orgId: string,
    userId: string,
    dto: AddNoteDto,
  ): Promise<ILeadActivity> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) {
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

    if (!lead || lead.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    if (lead.convertedClientId) {
      throw new BadRequestException('Lead has already been converted');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A client with this email address already exists in your organization',
        );
      }

      throw error;
    }

    await this.cache.delByPrefix(`leads:${orgId}:`);
    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToILead(result);
  }

  async capture(dto: CaptureLeadDto): Promise<{ id: string; message: string }> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
      select: { id: true, organizationId: true },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const title = dto.title ?? `Web Capture - ${dto.source}`;

    const lead = await this.prisma.lead.create({
      data: {
        title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        source: dto.source,
        data: (dto.data as any) ?? undefined,
        status: LeadStatus.NEW,
        brandId: brand.id,
        organizationId: brand.organizationId,
      },
    });

    await this.cache.delByPrefix(`leads:${brand.organizationId}:`);

    return { id: lead.id, message: 'Lead captured successfully' };
  }

  async getActivities(id: string, orgId: string): Promise<ILeadActivity[]> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) {
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

  private mapToILead(lead: any): ILead {
    return {
      id: lead.id,
      title: lead.title,
      name: lead.name ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      website: lead.website ?? undefined,
      status: lead.status as LeadStatus,
      source: lead.source ?? undefined,
      data: (lead.data as Record<string, unknown>) ?? undefined,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId ?? undefined,
      convertedClientId: lead.convertedClientId ?? undefined,
      followUpDate: lead.followUpDate ?? undefined,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }
}
