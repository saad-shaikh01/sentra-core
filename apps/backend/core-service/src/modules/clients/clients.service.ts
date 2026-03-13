import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, PrismaService } from '@sentra-core/prisma-client';
import { MailClientService } from '@sentra-core/mail-client';
import {
  IClient,
  IClientActivity,
  IPaginatedResponse,
  ClientStatus,
  ClientActivityType,
  UserRole,
} from '@sentra-core/types';
import {
  CreateClientDto,
  UpdateClientDto,
  QueryClientsDto,
  AssignClientDto,
} from './dto';
import { buildPaginationResponse, CacheService } from '../../common';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private mailService: MailClientService,
  ) {}

  async create(orgId: string, userId: string, dto: CreateClientDto): Promise<IClient> {
    const existingClient = await this.prisma.client.findFirst({
      where: { email: dto.email, organizationId: orgId, deletedAt: null },
    });

    if (existingClient) {
      throw new ConflictException('A client with this email already exists in your organization');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          email: dto.email,
          companyName: dto.companyName,
          contactName: dto.contactName,
          phone: dto.phone,
          address: dto.address,
          notes: dto.notes,
          brandId: dto.brandId,
          organizationId: orgId,
          portalAccess: false,
        },
      });

      await tx.clientActivity.create({
        data: {
          type: ClientActivityType.CREATED,
          data: { companyName: client.companyName },
          clientId: client.id,
          userId,
        },
      });

      return client;
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToIClient(result);
  }

  async findAll(
    orgId: string,
    query: QueryClientsDto,
    userId: string,
    role: UserRole,
  ): Promise<IPaginatedResponse<IClient>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `clients:${orgId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<IClient>>(cacheKey);
    if (cached) {
      return cached;
    }

    const { page = 1, limit = 20, search, status, brandId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = { organizationId: orgId, deletedAt: null };

    if (role === UserRole.UPSELL_AGENT) {
      where.upsellAgentId = userId;
    } else if (role === UserRole.PROJECT_MANAGER) {
      where.projectManagerId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          upsellAgent: { select: { id: true, name: true, avatarUrl: true } },
          projectManager: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    const result = buildPaginationResponse(
      clients.map((client) => this.mapToIClient(client)),
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
  ): Promise<IClient & { sales: Prisma.SaleUncheckedCreateInput[]; activities: IClientActivity[] }> {
    const cacheKey = `clients:${orgId}:${id}`;

    const cached = await this.cache.get<IClient & { sales: Prisma.SaleUncheckedCreateInput[]; activities: IClientActivity[] }>(cacheKey);
    if (cached) {
      return cached;
    }

    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        sales: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        upsellAgent: { select: { id: true, name: true, avatarUrl: true } },
        projectManager: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const result = {
      ...this.mapToIClient(client),
      sales: client.sales as unknown as Prisma.SaleUncheckedCreateInput[],
      activities: client.activities.map((activity) => this.mapToIClientActivity(activity)),
    };

    await this.cache.set(cacheKey, result);
    return result;
  }

  async update(id: string, orgId: string, dto: UpdateClientDto): Promise<IClient> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (dto.email && dto.email !== client.email) {
      const existing = await this.prisma.client.findFirst({
        where: { email: dto.email, organizationId: orgId, id: { not: id }, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException('A client with this email already exists in your organization');
      }
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        email: dto.email,
        companyName: dto.companyName,
        contactName: dto.contactName,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
      },
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToIClient(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return { message: 'Client deleted successfully' };
  }

  async assign(
    id: string,
    orgId: string,
    actorId: string,
    dto: AssignClientDto,
  ): Promise<IClient> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const [prevUpsell, prevProjectManager, nextUpsell, nextProjectManager] = await Promise.all([
      client.upsellAgentId
        ? this.prisma.user.findUnique({ where: { id: client.upsellAgentId }, select: { name: true } })
        : Promise.resolve(null),
      client.projectManagerId
        ? this.prisma.user.findUnique({ where: { id: client.projectManagerId }, select: { name: true } })
        : Promise.resolve(null),
      dto.upsellAgentId
        ? this.validateAssignee(dto.upsellAgentId, orgId, UserRole.UPSELL_AGENT, 'Upsell agent')
        : Promise.resolve(null),
      dto.projectManagerId
        ? this.validateAssignee(dto.projectManagerId, orgId, UserRole.PROJECT_MANAGER, 'Project manager')
        : Promise.resolve(null),
    ]);

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.client.update({
        where: { id },
        data: {
          ...(dto.upsellAgentId !== undefined ? { upsellAgentId: dto.upsellAgentId } : {}),
          ...(dto.projectManagerId !== undefined ? { projectManagerId: dto.projectManagerId } : {}),
        },
      }),
    ];

    if (dto.upsellAgentId !== undefined) {
      operations.push(
        this.prisma.clientActivity.create({
          data: {
            type: ClientActivityType.UPSELL_ASSIGNED,
            data: {
              from: client.upsellAgentId ?? null,
              fromName: prevUpsell?.name ?? null,
              to: dto.upsellAgentId ?? null,
              toName: nextUpsell?.name ?? null,
            },
            clientId: id,
            userId: actorId,
          },
        }),
      );
    }

    if (dto.projectManagerId !== undefined) {
      operations.push(
        this.prisma.clientActivity.create({
          data: {
            type: ClientActivityType.PM_ASSIGNED,
            data: {
              from: client.projectManagerId ?? null,
              fromName: prevProjectManager?.name ?? null,
              to: dto.projectManagerId ?? null,
              toName: nextProjectManager?.name ?? null,
            },
            clientId: id,
            userId: actorId,
          },
        }),
      );
    }

    await this.prisma.$transaction(operations);

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.findOne(id, orgId);
  }

  async updateStatus(
    id: string,
    orgId: string,
    userId: string,
    status: ClientStatus,
  ): Promise<IClient> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: { status },
    });

    await this.prisma.clientActivity.create({
      data: {
        type: ClientActivityType.STATUS_CHANGE,
        data: { from: client.status, to: status },
        clientId: id,
        userId,
      },
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToIClient(updated);
  }

  async addNote(
    id: string,
    orgId: string,
    userId: string,
    content: string,
  ): Promise<IClientActivity> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const activity = await this.prisma.clientActivity.create({
      data: {
        type: ClientActivityType.NOTE,
        data: { content },
        clientId: id,
        userId,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return this.mapToIClientActivity(activity);
  }

  async grantPortalAccess(
    id: string,
    orgId: string,
    actorId: string,
  ): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { brand: true },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (client.email.includes('@internal.sentra')) {
      throw new BadRequestException('Please add a valid email to this client before granting portal access');
    }

    if (client.portalAccess) {
      throw new BadRequestException('Client already has portal access');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.client.update({
        where: { id },
        data: {
          portalAccess: true,
          portalGrantedAt: new Date(),
          portalGrantedBy: actorId,
          emailOtp: hashedOtp,
          emailOtpExpiry: otpExpiry,
          mustSetPassword: true,
        },
      }),
      this.prisma.clientActivity.create({
        data: {
          type: ClientActivityType.PORTAL_ACCESS_GRANTED,
          data: { email: client.email },
          clientId: id,
          userId: actorId,
        },
      }),
    ]);

    const portalUrl = client.brand.portalDomain
      ? `https://${client.brand.portalDomain}`
      : client.brand.domain
        ? `https://${client.brand.domain}/portal`
        : 'http://localhost:4200/client-portal';

    await this.mailService.sendMail({
      to: client.email,
      subject: `${client.brand.name} portal access invitation`,
      template: 'CLIENT_PORTAL_INVITE',
      context: {
        name: client.contactName ?? client.companyName,
        brandName: client.brand.name,
        portalUrl,
        otp,
      },
    });

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return { message: 'Portal access granted and invitation email sent' };
  }

  async revokePortalAccess(id: string, orgId: string, actorId: string): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    await this.prisma.$transaction([
      this.prisma.client.update({
        where: { id },
        data: {
          portalAccess: false,
          emailOtp: null,
          emailOtpExpiry: null,
        },
      }),
      this.prisma.clientActivity.create({
        data: {
          type: ClientActivityType.PORTAL_ACCESS_REVOKED,
          data: { email: client.email },
          clientId: id,
          userId: actorId,
        },
      }),
    ]);

    await this.cache.delByPrefix(`clients:${orgId}:`);

    return { message: 'Portal access revoked' };
  }

  private async validateAssignee(
    userId: string,
    orgId: string,
    expectedRole: UserRole,
    label: string,
  ): Promise<{ name: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, organizationId: true, role: true },
    });

    if (!user || user.organizationId !== orgId) {
      throw new BadRequestException(`${label} not found in this organization`);
    }

    if (user.role !== expectedRole) {
      throw new BadRequestException(`User must have ${expectedRole} role`);
    }

    return { name: user.name };
  }

  private mapToIClient(client: {
    id: string;
    email: string;
    companyName: string;
    contactName: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    status: string;
    portalAccess: boolean;
    portalGrantedAt: Date | null;
    portalGrantedBy: string | null;
    emailVerified: boolean;
    mustSetPassword: boolean;
    upsellAgentId: string | null;
    projectManagerId: string | null;
    brandId: string;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
    upsellAgent?: { id: string; name: string; avatarUrl: string | null } | null;
    projectManager?: { id: string; name: string; avatarUrl: string | null } | null;
  }): IClient {
    return {
      id: client.id,
      email: client.email,
      companyName: client.companyName,
      contactName: client.contactName ?? undefined,
      phone: client.phone ?? undefined,
      address: client.address ?? undefined,
      notes: client.notes ?? undefined,
      status: client.status as ClientStatus,
      portalAccess: client.portalAccess,
      portalGrantedAt: client.portalGrantedAt ?? undefined,
      portalGrantedBy: client.portalGrantedBy ?? undefined,
      emailVerified: client.emailVerified,
      mustSetPassword: client.mustSetPassword,
      upsellAgentId: client.upsellAgentId ?? undefined,
      projectManagerId: client.projectManagerId ?? undefined,
      upsellAgent: client.upsellAgent
        ? {
          id: client.upsellAgent.id,
          name: client.upsellAgent.name,
          avatarUrl: client.upsellAgent.avatarUrl ?? undefined,
        }
        : undefined,
      projectManager: client.projectManager
        ? {
          id: client.projectManager.id,
          name: client.projectManager.name,
          avatarUrl: client.projectManager.avatarUrl ?? undefined,
        }
        : undefined,
      brandId: client.brandId,
      organizationId: client.organizationId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private mapToIClientActivity(activity: {
    id: string;
    type: string;
    data: Prisma.JsonValue;
    clientId: string;
    userId: string;
    createdAt: Date;
    user?: { id: string; name: string; avatarUrl: string | null } | null;
  }): IClientActivity {
    return {
      id: activity.id,
      type: activity.type as ClientActivityType,
      data: activity.data as Record<string, unknown>,
      clientId: activity.clientId,
      userId: activity.userId,
      user: activity.user
        ? {
          id: activity.user.id,
          name: activity.user.name,
          avatarUrl: activity.user.avatarUrl ?? undefined,
        }
        : undefined,
      createdAt: activity.createdAt,
    };
  }
}
