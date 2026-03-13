import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@sentra-core/prisma-client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  LeadStatus,
  LeadType,
  LeadSource,
  LeadActivityType,
  ClientActivityType,
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

  private generateTitle(dto: { name?: string; email?: string; source?: LeadSource }): string {
    const base = dto.name?.trim() || dto.email?.trim() || 'Unknown';
    return dto.source ? `Lead - ${base} - ${dto.source}` : `Lead - ${base}`;
  }

  private toInputJson(data?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    return data as Prisma.InputJsonValue | undefined;
  }

  async create(
    orgId: string,
    userId: string,
    dto: CreateLeadDto,
  ): Promise<ILead> {
    const title = dto.title?.trim() || this.generateTitle({
      name: dto.name,
      email: dto.email,
      source: dto.source,
    });

    const lead = await this.prisma.lead.create({
      data: {
        title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: dto.leadDate ? new Date(dto.leadDate) : new Date(),
        data: this.toInputJson(dto.data),
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

    const { page, limit, status, leadType, source, assignedToId, brandId, dateFrom, dateTo, search } = query;

    const agentRoles: UserRole[] = [UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT];
    const where: Prisma.LeadWhereInput = { organizationId: orgId, deletedAt: null };

    // Data visibility scoping
    if (agentRoles.includes(role)) {
      where.assignedToId = userId;
    } else if (role === UserRole.SALES_MANAGER) {
      const memberIds = await this.teams.getMemberIds(userId, orgId);
      if (memberIds.length > 0) {
        where.assignedToId = { in: [...memberIds, userId] };
      }
    }

    if (status) where.status = status;
    if (leadType) where.leadType = leadType;
    if (source) where.source = source;

    if (assignedToId && !agentRoles.includes(role)) {
      where.assignedToId = assignedToId;
    }

    if (brandId) where.brandId = brandId;

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

    const result: IPaginatedResponse<ILead> = buildPaginationResponse(
      leads.map((l) => this.mapToILead(l)),
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(
    id: string,
    orgId: string,
  ): Promise<ILead & {
    activities: ILeadActivity[];
    assignedTo?: { id: string; name: string; email: string; avatarUrl?: string };
  }> {
    const cacheKey = `leads:${orgId}:${id}`;

    const cached = await this.cache.get<ILead & {
      activities: ILeadActivity[];
      assignedTo?: { id: string; name: string; email: string; avatarUrl?: string };
    }>(cacheKey);
    if (cached) return cached;

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        assignedTo: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const result = {
      ...this.mapToILead(lead),
      activities: lead.activities.map((a) => this.mapToILeadActivity(a)),
      assignedTo: lead.assignedTo ?? undefined,
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

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const nextName = dto.name ?? lead.name ?? undefined;
    const nextEmail = dto.email ?? lead.email ?? undefined;
    const nextSource = dto.source ?? (lead.source as LeadSource | null) ?? undefined;
    const nextTitle = dto.title === undefined
      ? undefined
      : dto.title.trim() || this.generateTitle({
        name: nextName,
        email: nextEmail,
        source: nextSource,
      });

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        title: nextTitle,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: dto.leadDate ? new Date(dto.leadDate) : undefined,
        status: dto.status,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        data: this.toInputJson(dto.data),
        assignedToId: dto.assignedToId,
      },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILead(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

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

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const currentStatus = lead.status as LeadStatus;
    const allowedTransitions = LEAD_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${currentStatus} to ${dto.status}`);
    }

    if (dto.status === LeadStatus.FOLLOW_UP && !dto.followUpDate) {
      throw new BadRequestException('followUpDate is required when transitioning to FOLLOW_UP status');
    }

    const lostReason = dto.lostReason?.trim();

    if (dto.status === LeadStatus.CLOSED_LOST && !lostReason) {
      throw new BadRequestException('lostReason is required when transitioning to CLOSED_LOST status');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        followUpDate: dto.status === LeadStatus.FOLLOW_UP && dto.followUpDate
          ? new Date(dto.followUpDate)
          : null,
        lostReason: dto.status === LeadStatus.CLOSED_LOST ? lostReason : null,
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.STATUS_CHANGE,
        data: {
          from: currentStatus,
          to: dto.status,
          followUpDate: dto.followUpDate ?? null,
          lostReason: lostReason ?? null,
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

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assignedToId },
      select: { id: true, name: true, organizationId: true, role: true },
    });

    if (!assignee) throw new NotFoundException('Assignee not found');
    if (assignee.organizationId !== orgId) throw new BadRequestException('Assignee must be in the same organization');

    // Lead assignment is FrontSell only
    if (assignee.role !== 'FRONTSELL_AGENT' && assignee.role !== 'SALES_MANAGER' && assignee.role !== 'ADMIN' && assignee.role !== 'OWNER') {
      throw new BadRequestException('Lead can only be assigned to FRONTSELL_AGENT, SALES_MANAGER, ADMIN, or OWNER');
    }

    // Fetch previous assignee name for activity log
    let fromName: string | null = null;
    if (lead.assignedToId) {
      const prev = await this.prisma.user.findUnique({
        where: { id: lead.assignedToId },
        select: { name: true },
      });
      fromName = prev?.name ?? null;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
    });

    await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.ASSIGNMENT_CHANGE,
        data: {
          from: lead.assignedToId ?? null,
          to: dto.assignedToId,
          fromName,
          toName: assignee.name,
        },
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

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const activity = await this.prisma.leadActivity.create({
      data: {
        type: LeadActivityType.NOTE,
        data: { content: dto.content },
        leadId: id,
        userId,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await this.cache.delByPrefix(`leads:${orgId}:`);

    return this.mapToILeadActivity(activity);
  }

  async convert(
    id: string,
    orgId: string,
    userId: string,
    dto: ConvertLeadDto,
  ): Promise<ILead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');
    if (lead.convertedClientId) throw new BadRequestException('Lead has already been converted');

    const companyName = dto.companyName?.trim() || dto.contactName?.trim() || dto.email;

    let result;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            email: dto.email,
            companyName,
            contactName: dto.contactName,
            phone: dto.phone,
            brandId: dto.brandId ?? lead.brandId,
            organizationId: orgId,
            portalAccess: false,
            ...(dto.upsellAgentId ? { upsellAgentId: dto.upsellAgentId } : {}),
            ...(dto.projectManagerId ? { projectManagerId: dto.projectManagerId } : {}),
          },
        });

        await tx.clientActivity.create({
          data: {
            type: ClientActivityType.CREATED,
            data: { companyName },
            clientId: client.id,
            userId,
          },
        });

        if (dto.upsellAgentId) {
          const upsellUser = await tx.user.findUnique({
            where: { id: dto.upsellAgentId },
            select: { name: true, role: true, organizationId: true },
          });

          if (!upsellUser || upsellUser.organizationId !== orgId || upsellUser.role !== UserRole.UPSELL_AGENT) {
            throw new BadRequestException('Upsell agent must be a UPSELL_AGENT in the same organization');
          }

          await tx.clientActivity.create({
            data: {
              type: ClientActivityType.UPSELL_ASSIGNED,
              data: {
                from: null,
                fromName: null,
                to: dto.upsellAgentId,
                toName: upsellUser.name,
              },
              clientId: client.id,
              userId,
            },
          });
        }

        if (dto.projectManagerId) {
          const projectManager = await tx.user.findUnique({
            where: { id: dto.projectManagerId },
            select: { name: true, role: true, organizationId: true },
          });

          if (!projectManager || projectManager.organizationId !== orgId || projectManager.role !== UserRole.PROJECT_MANAGER) {
            throw new BadRequestException('Project manager must be a PROJECT_MANAGER in the same organization');
          }

          await tx.clientActivity.create({
            data: {
              type: ClientActivityType.PM_ASSIGNED,
              data: {
                from: null,
                fromName: null,
                to: dto.projectManagerId,
                toName: projectManager.name,
              },
              clientId: client.id,
              userId,
            },
          });
        }

        const updated = await tx.lead.update({
          where: { id },
          data: {
            convertedClientId: client.id,
            status: LeadStatus.CLOSED_WON,
          },
        });

        await tx.leadActivity.create({
          data: {
            type: LeadActivityType.CONVERSION,
            data: { clientId: client.id, companyName },
            leadId: id,
            userId,
          },
        });

        return updated;
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A client with this email address already exists in your organization');
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

    if (!brand) throw new NotFoundException('Brand not found');

    const title = dto.title?.trim() || this.generateTitle({
      name: dto.name,
      email: dto.email,
      source: dto.source,
    });

    const lead = await this.prisma.lead.create({
      data: {
        title,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        leadType: dto.leadType,
        source: dto.source,
        leadDate: new Date(),
        data: this.toInputJson(dto.data),
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

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException('Lead belongs to another organization');

    const activities = await this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return activities.map((a) => this.mapToILeadActivity(a));
  }

  async deleteNote(
    leadId: string,
    activityId: string,
    orgId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const activity = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: { lead: true },
    });

    if (!activity) throw new NotFoundException('Note not found');
    if (activity.lead.organizationId !== orgId) throw new ForbiddenException('Access denied');
    if (activity.type !== LeadActivityType.NOTE) throw new BadRequestException('Activity is not a note');
    if (activity.userId !== userId) throw new ForbiddenException('Only the author can delete this note');

    await this.prisma.leadActivity.delete({ where: { id: activityId } });
    await this.cache.delByPrefix(`leads:${orgId}:`);

    return { message: 'Note deleted successfully' };
  }

  private mapToILead(lead: {
    id: string;
    title: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    status: string;
    leadType: string | null;
    source: string | null;
    leadDate: Date | null;
    lostReason: string | null;
    data: Prisma.JsonValue | null;
    brandId: string;
    organizationId: string;
    assignedToId: string | null;
    convertedClientId: string | null;
    followUpDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ILead {
    return {
      id: lead.id,
      title: lead.title ?? undefined,
      name: lead.name ?? undefined,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      website: lead.website ?? undefined,
      status: lead.status as LeadStatus,
      leadType: (lead.leadType as LeadType | null) ?? undefined,
      source: (lead.source as LeadSource | null) ?? undefined,
      leadDate: lead.leadDate ?? undefined,
      lostReason: lead.lostReason ?? undefined,
      data: (lead.data as Record<string, unknown> | null) ?? undefined,
      brandId: lead.brandId,
      organizationId: lead.organizationId,
      assignedToId: lead.assignedToId ?? undefined,
      convertedClientId: lead.convertedClientId ?? undefined,
      followUpDate: lead.followUpDate ?? undefined,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  private mapToILeadActivity(a: {
    id: string;
    type: string;
    data: Prisma.JsonValue;
    leadId: string;
    userId: string;
    createdAt: Date;
    user?: { id: string; name: string; avatarUrl: string | null } | null;
  }): ILeadActivity {
    return {
      id: a.id,
      type: a.type as LeadActivityType,
      data: a.data as Record<string, unknown>,
      leadId: a.leadId,
      userId: a.userId,
      user: a.user
        ? {
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl ?? undefined,
        }
        : undefined,
      createdAt: a.createdAt,
    };
  }
}
