import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  PrismaService,
  UserRole as PrismaUserRole,
} from '@sentra-core/prisma-client';
import * as crypto from 'crypto';
import {
  ISale,
  ISaleActivity,
  ISaleCreateResponse,
  ISaleItem,
  IClientCollisionWarning,
  IPaginatedResponse,
  SaleStatus,
  UserRole,
  TransactionType,
  TransactionStatus,
  PaymentPlanType,
  DiscountType,
  SaleActivityType,
  LeadActivityType,
  LeadStatus,
  ClientActivityType,
  InvoiceStatus,
} from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { TeamsService } from '../teams';
import { SalesNotificationService } from './sales-notification.service';
import {
  CreateSaleDto,
  UpdateSaleDto,
  QuerySalesDto,
  ChargeSaleDto,
  CreateSubscriptionDto,
  CreateRefundDto,
  RefundType,
  CreateChargebackDto,
} from './dto';

const ALLOWED_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.DRAFT]: [SaleStatus.PENDING, SaleStatus.CANCELLED],
  [SaleStatus.PENDING]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.ACTIVE]: [SaleStatus.COMPLETED, SaleStatus.ON_HOLD, SaleStatus.CANCELLED, SaleStatus.REFUNDED],
  [SaleStatus.ON_HOLD]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.COMPLETED]: [SaleStatus.REFUNDED],
  [SaleStatus.CANCELLED]: [],
  [SaleStatus.REFUNDED]: [],
};

const RESTRICTED_TRANSITIONS: Partial<Record<string, UserRole[]>> = {
  [`${SaleStatus.ACTIVE}${SaleStatus.REFUNDED}`]: [UserRole.OWNER, UserRole.ADMIN],
  [`${SaleStatus.COMPLETED}${SaleStatus.REFUNDED}`]: [UserRole.OWNER, UserRole.ADMIN],
  [`${SaleStatus.PENDING}${SaleStatus.CANCELLED}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  [`${SaleStatus.ACTIVE}${SaleStatus.CANCELLED}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  [`${SaleStatus.ON_HOLD}${SaleStatus.CANCELLED}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  [`${SaleStatus.ACTIVE}${SaleStatus.COMPLETED}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  [`${SaleStatus.ACTIVE}${SaleStatus.ON_HOLD}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  [`${SaleStatus.ON_HOLD}${SaleStatus.ACTIVE}`]: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private authorizeNet: AuthorizeNetService,
    private cache: CacheService,
    private teams: TeamsService,
    private salesNotificationService: SalesNotificationService,
  ) {}

  async create(
    orgId: string,
    actorId: string,
    actorRole: UserRole,
    dto: CreateSaleDto,
  ): Promise<ISaleCreateResponse> {
    if (!dto.clientId && !dto.leadId) {
      throw new BadRequestException('Either clientId or leadId is required');
    }

    const paymentPlan = dto.paymentPlan ?? PaymentPlanType.ONE_TIME;

    // Calculate totalAmount from items if not provided
    let totalAmount = dto.totalAmount;
    if (!totalAmount && dto.items && dto.items.length > 0) {
      totalAmount = dto.items.reduce((sum, item) => {
        const price = item.customPrice ?? item.unitPrice;
        return sum + price * item.quantity;
      }, 0);
    }
    if (!totalAmount) throw new BadRequestException('totalAmount is required when no items are provided');

    const hasDiscountType = dto.discountType !== undefined && dto.discountType !== null;
    const hasDiscountValue = dto.discountValue !== undefined && dto.discountValue !== null;
    if ((hasDiscountType && !hasDiscountValue) || (!hasDiscountType && hasDiscountValue)) {
      throw new BadRequestException(
        'discountType and discountValue must both be provided together',
      );
    }

    let discountedTotal: number | undefined;
    if (hasDiscountType && hasDiscountValue) {
      this.validateDiscount(totalAmount, dto.discountType, dto.discountValue);
      discountedTotal = this.computeDiscountedTotal(
        totalAmount,
        dto.discountType,
        dto.discountValue,
      );
    }

    const { clientId, collisionWarning } = dto.leadId
      ? await this.resolveClientIdFromLead(orgId, actorId, dto.leadId)
      : { clientId: await this.resolveClientId(orgId, dto.clientId), collisionWarning: undefined };

    if (this.isAgentRole(actorRole)) {
      await this.validateAgentClientScope(clientId, actorId, orgId);

      if (dto.status && ![SaleStatus.DRAFT, SaleStatus.PENDING].includes(dto.status)) {
        throw new ForbiddenException('Agents may only create DRAFT or PENDING sales');
      }
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          totalAmount,
          status: dto.status,
          currency: dto.currency || 'USD',
          description: dto.description,
          contractUrl: dto.contractUrl,
          discountType: dto.discountType ?? null,
          discountValue: dto.discountValue ?? null,
          discountedTotal: discountedTotal ?? null,
          paymentPlan,
          installmentCount: paymentPlan === PaymentPlanType.INSTALLMENTS ? (dto.installmentCount ?? 2) : null,
          clientId,
          brandId: dto.brandId,
          organizationId: orgId,
          items: dto.items
            ? {
                create: dto.items.map((item) => ({
                  name: item.name,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  customPrice: item.customPrice,
                  packageId: item.packageId ?? null,
                  packageName: item.packageName ?? null,
                })),
              }
            : undefined,
        },
        include: { items: true },
      });

      const createdInvoices = await this.generateInvoices(
        tx,
        createdSale.id,
        discountedTotal ?? totalAmount,
        paymentPlan,
        createdSale.installmentCount,
        createdSale.currency,
        createdSale.brandId,
      );

      await this.logActivity(tx, createdSale.id, actorId, SaleActivityType.CREATED, {
        totalAmount: Number(createdSale.totalAmount),
        status: createdSale.status,
        paymentPlan: createdSale.paymentPlan,
        clientId: createdSale.clientId,
        leadId: dto.leadId ?? null,
      });

      for (const invoice of createdInvoices) {
        await this.logActivity(tx, createdSale.id, actorId, SaleActivityType.INVOICE_CREATED, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate?.toISOString() ?? null,
        });
      }

      if (createdSale.discountType && createdSale.discountValue) {
        await this.logActivity(tx, createdSale.id, actorId, SaleActivityType.DISCOUNT_APPLIED, {
          discountType: createdSale.discountType,
          discountValue: Number(createdSale.discountValue),
          discountedTotal: createdSale.discountedTotal != null ? Number(createdSale.discountedTotal) : null,
        });
      }

      return createdSale;
    });

    if (dto.leadId) {
      await this.cache.delByPrefix(`leads:${orgId}:`);
      await this.cache.delByPrefix(`clients:${orgId}:`);
    }
    await this.cache.delByPrefix(`sales:${orgId}:`);

    return {
      ...this.mapToISale(sale),
      collisionWarning,
    };
  }

  private isAgentRole(role: UserRole): boolean {
    return role === UserRole.FRONTSELL_AGENT || role === UserRole.UPSELL_AGENT;
  }

  private async validateAgentClientScope(
    clientId: string,
    actorId: string,
    organizationId: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        organizationId,
        assignedToId: actorId,
        convertedClientId: clientId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!lead) {
      throw new ForbiddenException('Agents can only create sales for their own assigned clients');
    }
  }

  private validateTransition(
    from: SaleStatus,
    to: SaleStatus,
    actorRole: UserRole,
  ): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new UnprocessableEntityException(
        `Status transition from ${from} to ${to} is not allowed`,
      );
    }

    const key = `${from}${to}`;
    const requiredRoles = RESTRICTED_TRANSITIONS[key];
    if (requiredRoles && !requiredRoles.includes(actorRole)) {
      throw new ForbiddenException(
        `Your role does not permit the ${from}  ${to} transition`,
      );
    }
  }

  private computeDiscountedTotal(
    totalAmount: number,
    discountType: DiscountType,
    discountValue: number,
  ): number {
    if (discountType === DiscountType.PERCENTAGE) {
      return Math.round(totalAmount * (1 - discountValue / 100) * 100) / 100;
    }

    return Math.round((totalAmount - discountValue) * 100) / 100;
  }

  private validateDiscount(
    totalAmount: number,
    discountType: DiscountType,
    discountValue: number,
  ): void {
    if (discountValue <= 0) {
      throw new BadRequestException('discountValue must be greater than 0');
    }
    if (discountType === DiscountType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }
    if (discountType === DiscountType.FIXED_AMOUNT && discountValue >= totalAmount) {
      throw new BadRequestException('Fixed discount must be less than totalAmount');
    }
  }

  private async logActivity(
    tx: Prisma.TransactionClient | PrismaService,
    saleId: string,
    userId: string,
    type: SaleActivityType,
    data: Record<string, unknown>,
  ): Promise<void> {
    await (tx as any).saleActivity.create({
      data: { saleId, userId, type, data: data as Prisma.InputJsonValue },
    });
  }

  private async getNextInvoiceNumber(
    tx: Prisma.TransactionClient,
    brandId: string,
  ): Promise<string> {
    const currentYear = new Date().getFullYear();

    await tx.$executeRaw`
      INSERT INTO "InvoiceSequence" ("id", "brandId", "year", "lastSeq")
      VALUES (gen_random_uuid()::text, ${brandId}, ${currentYear}, 1)
      ON CONFLICT ("brandId") DO UPDATE
      SET
        "lastSeq" = CASE
          WHEN "InvoiceSequence"."year" = ${currentYear} THEN "InvoiceSequence"."lastSeq" + 1
          ELSE 1
        END,
        "year" = ${currentYear}
    `;

    const seq = await tx.invoiceSequence.findUnique({ where: { brandId } });
    const paddedSeq = String(seq!.lastSeq).padStart(4, '0');
    return `INV-${currentYear}-${paddedSeq}`;
  }

  private async generateInvoices(
    tx: Prisma.TransactionClient,
    saleId: string,
    totalAmount: number,
    plan: PaymentPlanType,
    installmentCount: number | null,
    currency: string,
    brandId: string,
  ): Promise<Array<{ id: string; invoiceNumber: string; amount: any; dueDate: Date }>> {
    const now = new Date();

    if (plan === PaymentPlanType.ONE_TIME) {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 7); // due in 7 days
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await this.getNextInvoiceNumber(tx, brandId),
          amount: totalAmount,
          dueDate,
          saleId,
          paymentToken: crypto.randomBytes(32).toString('hex'),
          notes: currency !== 'USD' ? currency : undefined,
        },
      });
      return [invoice];
    }

    if (plan === PaymentPlanType.INSTALLMENTS && installmentCount) {
      const installmentAmount = Math.round((totalAmount / installmentCount) * 100) / 100;
      const invoices: Array<{ id: string; invoiceNumber: string; amount: any; dueDate: Date }> = [];
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i + 1);
        // Last installment absorbs rounding difference
        const amount =
          i === installmentCount - 1
            ? Math.round((totalAmount - installmentAmount * (installmentCount - 1)) * 100) / 100
            : installmentAmount;
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await this.getNextInvoiceNumber(tx, brandId),
            amount,
            dueDate,
            saleId,
            paymentToken: crypto.randomBytes(32).toString('hex'),
            notes: `Installment ${i + 1} of ${installmentCount}`,
          },
        });
        invoices.push(invoice);
      }
      return invoices;
    }
    // SUBSCRIPTION plan: no invoices generated upfront — ARB handles billing
    return [];
  }

  private async resolveClientId(orgId: string, clientId?: string): Promise<string> {
    if (!clientId) {
      throw new BadRequestException('clientId is required when leadId is not provided');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client.id;
  }

  private async resolveClientIdFromLead(
    orgId: string,
    actorId: string,
    leadId: string,
  ): Promise<{ clientId: string; collisionWarning?: IClientCollisionWarning }> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead || lead.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (lead.organizationId !== orgId) {
      throw new ForbiddenException('Lead belongs to another organization');
    }

    if (lead.convertedClientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: lead.convertedClientId, organizationId: orgId, deletedAt: null },
        select: { id: true },
      });

      if (!client) {
        throw new BadRequestException('Lead is linked to an invalid client record');
      }

      return { clientId: client.id };
    }

    return this.prisma.$transaction(async (tx) => {
      const reusableClient = lead.email
        ? await tx.client.findFirst({
            where: { email: lead.email, organizationId: orgId, deletedAt: null },
            select: { id: true, companyName: true },
          })
        : null;

      const client =
        reusableClient ??
        (await tx.client.create({
          data: {
            email: lead.email ?? this.buildPlaceholderEmail(lead.id),
            companyName: this.buildLeadCompanyName(lead),
            contactName: lead.name ?? undefined,
            phone: lead.phone ?? undefined,
            brandId: lead.brandId,
            organizationId: orgId,
            portalAccess: false,
          },
          select: { id: true, companyName: true },
        }));

      const collisionWarning = reusableClient && reusableClient.id !== lead.convertedClientId
        ? {
            matched: true,
            matchedClientId: reusableClient.id,
            matchedClientName: reusableClient.companyName,
          }
        : undefined;

      if (!reusableClient) {
        await tx.clientActivity.create({
          data: {
            type: ClientActivityType.CREATED,
            data: { companyName: client.companyName, trigger: 'first_sale' },
            clientId: client.id,
            userId: actorId,
          },
        });
      }

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          convertedClientId: client.id,
          status: LeadStatus.CLOSED_WON,
        },
      });

      await tx.leadActivity.create({
        data: {
          type: LeadActivityType.CONVERSION,
          data: {
            clientId: client.id,
            companyName: client.companyName,
            trigger: 'first_sale',
          },
          leadId: lead.id,
          userId: actorId,
        },
      });

      return {
        clientId: client.id,
        collisionWarning,
      };
    });
  }

  private buildPlaceholderEmail(leadId: string): string {
    return `noemail-${leadId}@internal.sentra`;
  }

  private buildLeadCompanyName(lead: {
    title: string | null;
    name: string | null;
    email: string | null;
  }): string {
    return lead.name?.trim()
      || lead.title?.trim()
      || lead.email?.trim()
      || 'New Client';
  }

  async findAll(
    orgId: string,
    query: QuerySalesDto,
    userId: string,
    role: UserRole,
  ): Promise<IPaginatedResponse<ISale>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `sales:${orgId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<ISale>>(cacheKey);
    if (cached) return cached;

    const { page, limit, status, clientId, brandId, dateFrom, dateTo } = query;
    const agentRoles: UserRole[] = [UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT];
    const where: Record<string, any> = { organizationId: orgId, deletedAt: null };

    // Data visibility scoping
    if (agentRoles.includes(role)) {
      // Agents: only clients from their own assigned leads
      const agentLeads = await this.prisma.lead.findMany({
        where: { assignedToId: userId, deletedAt: null, convertedClientId: { not: null } },
        select: { convertedClientId: true },
      });
      const clientIds = agentLeads
        .filter((l): l is { convertedClientId: string } => l.convertedClientId !== null)
        .map((l) => l.convertedClientId);
      where.clientId = { in: clientIds };
    } else if (role === UserRole.SALES_MANAGER) {
      // Managers: see their own agents' client sales too
      const memberIds = await this.teams.getMemberIds(userId, orgId);
      if (memberIds.length > 0) {
        const teamLeads = await this.prisma.lead.findMany({
          where: { assignedToId: { in: memberIds }, deletedAt: null, convertedClientId: { not: null } },
          select: { convertedClientId: true },
        });
        const clientIds = teamLeads
          .filter((l): l is { convertedClientId: string } => l.convertedClientId !== null)
          .map((l) => l.convertedClientId);
        if (clientIds.length > 0) where.clientId = { in: clientIds };
      }
    }

    if (status) where.status = status as SaleStatus;
    if (clientId) where.clientId = clientId;
    if (brandId) where.brandId = brandId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { client: true, items: true },
      }),
      this.prisma.sale.count({ where }),
    ]);

    const result: IPaginatedResponse<ISale> = buildPaginationResponse(
      sales.map((s) => this.mapToISale(s)),
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(id: string, orgId: string) {
    const cacheKey = `sales:${orgId}:${id}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        invoices: true,
        transactions: true,
        items: true,
        activities: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.deletedAt) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    try {
      for (const invoice of sale.invoices ?? []) {
        if (
          invoice.status === InvoiceStatus.UNPAID
          && invoice.dueDate
          && invoice.dueDate < new Date()
        ) {
          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.OVERDUE },
          });

          await this.logActivity(this.prisma, sale.id, 'system', SaleActivityType.INVOICE_UPDATED, {
            invoiceId: invoice.id,
            status: InvoiceStatus.OVERDUE,
          });

          this.salesNotificationService
            .resolveRecipientsByRole(sale.organizationId, [
              PrismaUserRole.OWNER,
              PrismaUserRole.ADMIN,
              PrismaUserRole.SALES_MANAGER,
            ])
            .then((recipients) =>
              this.salesNotificationService.dispatch({
                type: NotificationType.INVOICE_OVERDUE,
                message: `Invoice ${invoice.id} for sale ${sale.id} is overdue.`,
                saleId: sale.id,
                organizationId: sale.organizationId,
                recipientIds: recipients,
                data: { invoiceId: invoice.id },
              }),
            )
            .catch((err) => this.logger.error('Notification dispatch failed', err));
        }
      }
    } catch (err) {
      this.logger.error('Overdue invoice detection failed', err);
    }

    const mappedSale = this.mapToISale(sale);
    await this.cache.set(cacheKey, mappedSale);
    return mappedSale;
  }

  async update(
    id: string,
    orgId: string,
    actorId: string,
    actorRole: UserRole,
    dto: UpdateSaleDto,
  ): Promise<ISale> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    if (dto.status && dto.status !== sale.status) {
      this.validateTransition(sale.status as SaleStatus, dto.status, actorRole);
    }

    if (this.isAgentRole(actorRole)) {
      await this.validateAgentClientScope(sale.clientId, actorId, orgId);

      const dtoFields = dto as Record<string, unknown>;
      const financialFields = ['totalAmount', 'currency', 'paymentPlan', 'discountType', 'discountValue'];
      const attemptedFinancialUpdate = financialFields.some((field) => dtoFields[field] !== undefined);

      if (attemptedFinancialUpdate) {
        throw new ForbiddenException('Agents cannot modify financial fields');
      }
    }

    const hasDiscountType = dto.discountType !== undefined && dto.discountType !== null;
    const hasDiscountValue = dto.discountValue !== undefined && dto.discountValue !== null;
    if ((hasDiscountType && !hasDiscountValue) || (!hasDiscountType && hasDiscountValue)) {
      throw new BadRequestException(
        'discountType and discountValue must both be provided together',
      );
    }

    const discountChangeRequested =
      dto.discountType !== undefined || dto.discountValue !== undefined;

    if (discountChangeRequested) {
      if (![SaleStatus.DRAFT, SaleStatus.PENDING].includes(sale.status as SaleStatus)) {
        throw new UnprocessableEntityException(
          'Discount can only be changed on DRAFT or PENDING sales',
        );
      }
    }

    let discountedTotal: number | undefined;
    if (hasDiscountType && hasDiscountValue) {
      const base = Number(dto.totalAmount ?? sale.totalAmount);
      this.validateDiscount(base, dto.discountType, dto.discountValue);
      discountedTotal = this.computeDiscountedTotal(base, dto.discountType, dto.discountValue);
    } else if (dto.discountType === null || dto.discountValue === null) {
      discountedTotal = undefined;
    }

    const existingStatus = sale.status;
    const newStatus = dto.status;

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        totalAmount: dto.totalAmount,
        currency: dto.currency,
        description: dto.description,
        contractUrl: dto.contractUrl,
        status: dto.status,
        discountType: discountChangeRequested ? dto.discountType ?? null : undefined,
        discountValue: discountChangeRequested ? dto.discountValue ?? null : undefined,
        discountedTotal: discountChangeRequested ? discountedTotal ?? null : undefined,
      },
    });

    if (dto.status && dto.status !== sale.status) {
      await this.logActivity(this.prisma, id, actorId, SaleActivityType.STATUS_CHANGE, {
        from: sale.status,
        to: dto.status,
      });

      this.salesNotificationService
        .resolveRecipientsByRole(sale.organizationId, [
          PrismaUserRole.OWNER,
          PrismaUserRole.ADMIN,
          PrismaUserRole.SALES_MANAGER,
        ])
        .then((recipients) =>
          this.salesNotificationService.dispatch({
            type: NotificationType.SALE_STATUS_CHANGED,
            message: `Sale ${sale.id} status changed from ${sale.status} to ${newStatus}.`,
            saleId: sale.id,
            organizationId: sale.organizationId,
            recipientIds: recipients,
            data: { from: sale.status, to: newStatus },
          }),
        )
        .catch((err) => this.logger.error('Notification dispatch failed', err));
    }

    const discountChanged =
      (dto.discountType !== undefined && dto.discountType !== sale.discountType) ||
      (dto.discountValue !== undefined &&
        Number(dto.discountValue) !== Number(sale.discountValue));

    if (discountChanged) {
      await this.logActivity(this.prisma, id, actorId, SaleActivityType.DISCOUNT_APPLIED, {
        discountType: updated.discountType ?? null,
        discountValue: updated.discountValue != null ? Number(updated.discountValue) : null,
        discountedTotal: updated.discountedTotal != null ? Number(updated.discountedTotal) : null,
      });
    }

    await this.cache.delByPrefix(`sales:${orgId}:`);

    // Fire-and-forget HTTP call to pm-service when sale becomes ACTIVE (closed-won)
    if (dto.status === 'ACTIVE' && existingStatus !== 'ACTIVE') {
      const pmApiUrl = process.env.PM_SERVICE_URL || 'http://localhost:3003';
      const serviceKey = process.env.INTERNAL_SERVICE_KEY || 'internal-service-key';
      fetch(`${pmApiUrl}/api/pm/pipeline/sale-closed-won`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': serviceKey,
        },
        body: JSON.stringify({
          saleId: id,
          clientId: sale.clientId,
          orgId,
          totalAmount: sale.totalAmount ? Number(sale.totalAmount) : undefined,
          description: sale.description ?? undefined,
        }),
      }).catch(() => {}); // fire-and-forget
    }

    return this.mapToISale(updated);
  }

  async remove(id: string, orgId: string, actorId: string): Promise<{ message: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');
    if (sale.deletedAt) throw new BadRequestException('Sale is already archived');

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: { deletedAt: now },
      });

      await this.logActivity(tx, id, actorId, SaleActivityType.STATUS_CHANGE, {
        action: 'ARCHIVED',
        deletedAt: now.toISOString(),
      });
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { message: 'Sale archived successfully' };
  }

  async charge(id: string, orgId: string, actorId: string, dto: ChargeSaleDto): Promise<any> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    // SALE-BE-002: Auto-create CustomerProfile if not yet linked
    let customerProfileId = sale.customerProfileId;
    let paymentProfileId = sale.paymentProfileId;

    if (!customerProfileId && dto.opaqueData) {
      // Create CustomerProfile from opaque card data
      const profileResult = await this.authorizeNet.createCustomerProfile({
        email: sale.client.email,
        description: `${sale.client.companyName} - Sale ${sale.id}`,
      });
      if (!profileResult.success || !profileResult.customerProfileId) {
        throw new BadRequestException(`Failed to create customer profile: ${profileResult.message}`);
      }
      customerProfileId = profileResult.customerProfileId;

      const paymentResult = await this.authorizeNet.createPaymentProfile({
        customerProfileId,
        opaqueData: dto.opaqueData,
      });
      if (!paymentResult.success || !paymentResult.paymentProfileId) {
        throw new BadRequestException(`Failed to create payment profile: ${paymentResult.message}`);
      }
      paymentProfileId = paymentResult.paymentProfileId;

      // Persist the profile IDs
      await this.prisma.sale.update({
        where: { id },
        data: { customerProfileId, paymentProfileId },
      });
    }

    if (!customerProfileId || !paymentProfileId) {
      throw new BadRequestException('Sale does not have payment profiles configured. Provide opaqueData to link a card.');
    }

    const result = await this.authorizeNet.chargeCustomerProfile({
      customerProfileId,
      paymentProfileId,
      amount: dto.amount,
      invoiceNumber: dto.invoiceNumber,
    });

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: result.transactionId,
        type: TransactionType.ONE_TIME,
        amount: dto.amount,
        status: result.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        responseCode: result.responseCode,
        responseMessage: result.message,
        saleId: id,
        invoiceId: dto.invoiceId,
      },
    });

    if (!result.success) {
      await this.logActivity(this.prisma, id, actorId, SaleActivityType.PAYMENT_FAILED, {
        amount: Number(dto.amount),
        reason: result.message ?? 'Unknown error',
        responseCode: result.responseCode ?? null,
      });

      this.salesNotificationService
        .resolveRecipientsByRole(sale.organizationId, [
          PrismaUserRole.OWNER,
          PrismaUserRole.ADMIN,
          PrismaUserRole.SALES_MANAGER,
        ])
        .then((recipients) =>
          this.salesNotificationService.dispatch({
            type: NotificationType.PAYMENT_FAILED,
            message: `Payment failed for sale ${sale.id}.`,
            saleId: sale.id,
            organizationId: sale.organizationId,
            recipientIds: recipients,
            data: { saleId: sale.id },
          }),
        )
        .catch((err) => this.logger.error('Notification dispatch failed', err));

      throw new BadRequestException(`Payment failed: ${result.message}`);
    }

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.PAYMENT_RECEIVED, {
      transactionId: result.transactionId,
      amount: Number(dto.amount),
      invoiceId: dto.invoiceId ?? null,
    });

    // Mark linked invoice as paid
    if (dto.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { status: 'PAID' },
      });
    }

    // Invalidate sale detail cache since transactions are included
    await this.cache.del(`sales:${orgId}:${id}`);

    return { transaction, authorizeNetResponse: result };
  }

  async subscribe(id: string, orgId: string, actorId: string, dto: CreateSubscriptionDto): Promise<any> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');
    if (!sale.customerProfileId || !sale.paymentProfileId) {
      throw new BadRequestException('Sale does not have payment profiles configured');
    }
    if (sale.subscriptionId) {
      throw new BadRequestException('Sale already has an active subscription');
    }

    const result = await this.authorizeNet.createSubscription({
      name: dto.name,
      intervalLength: dto.intervalLength,
      intervalUnit: dto.intervalUnit,
      startDate: dto.startDate,
      totalOccurrences: dto.totalOccurrences,
      amount: dto.amount,
      customerProfileId: sale.customerProfileId,
      paymentProfileId: sale.paymentProfileId,
    });

    if (!result.success) {
      throw new BadRequestException(`Subscription creation failed: ${result.message}`);
    }

    await this.prisma.sale.update({
      where: { id },
      data: {
        subscriptionId: result.subscriptionId,
        status: SaleStatus.ACTIVE,
      },
    });

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.STATUS_CHANGE, {
      from: sale.status,
      to: SaleStatus.ACTIVE,
      trigger: 'subscription_activated',
      subscriptionId: result.subscriptionId,
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { subscriptionId: result.subscriptionId };
  }

  async addNote(
    id: string,
    orgId: string,
    actorId: string,
    note: string,
  ): Promise<{ success: boolean }> {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.NOTE, { note });

    return { success: true };
  }

  async refund(
    id: string,
    orgId: string,
    actorId: string,
    dto: CreateRefundDto,
  ): Promise<{ message: string; transactionId?: string }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.organizationId !== orgId) {
      throw new ForbiddenException('Sale belongs to another organization');
    }

    if (![SaleStatus.ACTIVE, SaleStatus.COMPLETED].includes(sale.status as SaleStatus)) {
      throw new UnprocessableEntityException(
        'Refunds can only be issued on ACTIVE or COMPLETED sales',
      );
    }

    if (dto.type === RefundType.PARTIAL && dto.amount === undefined) {
      throw new BadRequestException('amount is required for PARTIAL refunds');
    }
    if (dto.type === RefundType.MANUAL && (!dto.note || dto.note.trim().length < 10)) {
      throw new BadRequestException('note is required for MANUAL refunds');
    }
    if (
      (dto.type === RefundType.FULL || dto.type === RefundType.PARTIAL)
      && !dto.transactionId
    ) {
      throw new BadRequestException('transactionId is required for FULL and PARTIAL refunds');
    }

    const refundAmount = dto.amount ?? Number(sale.totalAmount);
    let gatewayResult:
      | { success: boolean; transactionId?: string; responseCode?: string; message?: string }
      | undefined;

    if (dto.type === RefundType.FULL || dto.type === RefundType.PARTIAL) {
      gatewayResult = await this.authorizeNet.refundTransaction({
        transactionId: dto.transactionId!,
        amount: refundAmount,
        cardLastFour: dto.cardLastFour,
      });
    }

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: gatewayResult?.transactionId ?? null,
        type: TransactionType.REFUND,
        amount: refundAmount,
        status:
          dto.type === RefundType.MANUAL
            ? TransactionStatus.SUCCESS
            : gatewayResult?.success
              ? TransactionStatus.SUCCESS
              : TransactionStatus.FAILED,
        responseCode: gatewayResult?.responseCode,
        responseMessage: dto.type === RefundType.MANUAL ? dto.note : gatewayResult?.message,
        saleId: id,
      },
    });

    if (dto.type !== RefundType.MANUAL && !gatewayResult?.success) {
      throw new BadRequestException(`Refund failed: ${gatewayResult?.message ?? 'Unknown error'}`);
    }

    if (dto.type === RefundType.FULL || dto.type === RefundType.MANUAL) {
      this.validateTransition(sale.status as SaleStatus, SaleStatus.REFUNDED, UserRole.ADMIN);
      await this.prisma.sale.update({
        where: { id },
        data: { status: SaleStatus.REFUNDED },
      });
    }

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.REFUND_ISSUED, {
      amount: refundAmount,
      type: dto.type,
      transactionId: dto.transactionId ?? null,
      note: dto.note ?? null,
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return {
      message: 'Refund issued successfully',
      transactionId: transaction.transactionId ?? undefined,
    };
  }

  async recordChargeback(
    id: string,
    orgId: string,
    actorId: string,
    dto: CreateChargebackDto,
  ): Promise<{ message: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.organizationId !== orgId) {
      throw new ForbiddenException('Sale belongs to another organization');
    }

    if (dto.amount === undefined || dto.amount === null) {
      throw new BadRequestException('amount is required');
    }
    if (!dto.notes || dto.notes.trim().length < 10) {
      throw new BadRequestException('notes must be at least 10 characters');
    }

    if (sale.status === SaleStatus.DRAFT || sale.deletedAt) {
      throw new UnprocessableEntityException(
        'Cannot file chargeback on a draft or archived sale',
      );
    }

    await this.prisma.paymentTransaction.create({
      data: {
        transactionId: null,
        type: TransactionType.CHARGEBACK,
        amount: dto.amount,
        status: TransactionStatus.PENDING,
        responseMessage: dto.notes,
        saleId: id,
      },
    });

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.CHARGEBACK_FILED, {
      amount: dto.amount,
      notes: dto.notes,
      evidenceUrl: dto.evidenceUrl ?? null,
      chargebackDate: dto.chargebackDate ?? new Date().toISOString(),
    });

    this.salesNotificationService
      .resolveRecipientsByRole(sale.organizationId, [
        PrismaUserRole.OWNER,
        PrismaUserRole.ADMIN,
      ])
      .then((recipients) =>
        this.salesNotificationService.dispatch({
          type: NotificationType.CHARGEBACK_FILED,
          message: `A chargeback was filed against sale ${sale.id}. Immediate review required.`,
          saleId: sale.id,
          organizationId: sale.organizationId,
          recipientIds: recipients,
          data: { amount: dto.amount, notes: dto.notes },
        }),
      )
      .catch((err) => this.logger.error('Notification dispatch failed', err));

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { message: 'Chargeback recorded successfully' };
  }

  async cancelSubscription(id: string, orgId: string): Promise<{ message: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');
    if (!sale.subscriptionId) throw new BadRequestException('Sale does not have an active subscription');

    const result = await this.authorizeNet.cancelSubscription(sale.subscriptionId);
    if (!result.success) throw new BadRequestException(`Cancellation failed: ${result.message}`);

    await this.prisma.sale.update({
      where: { id },
      data: { subscriptionId: null },
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { message: 'Subscription cancelled successfully' };
  }

  private mapToISale(sale: any): ISale {
    return {
      id: sale.id,
      totalAmount: Number(sale.totalAmount),
      status: sale.status as SaleStatus,
      currency: sale.currency,
      description: sale.description ?? undefined,
      contractUrl: sale.contractUrl ?? undefined,
      paymentPlan: sale.paymentPlan as PaymentPlanType,
      installmentCount: sale.installmentCount ?? undefined,
      discountType: sale.discountType ?? undefined,
      discountValue: sale.discountValue != null ? Number(sale.discountValue) : undefined,
      discountedTotal: sale.discountedTotal != null ? Number(sale.discountedTotal) : undefined,
      clientId: sale.clientId,
      brandId: sale.brandId,
      organizationId: sale.organizationId,
      customerProfileId: sale.customerProfileId ?? undefined,
      paymentProfileId: sale.paymentProfileId ?? undefined,
      subscriptionId: sale.subscriptionId ?? undefined,
      items: sale.items ? sale.items.map((i: any): ISaleItem => ({
        id: i.id,
        name: i.name,
        description: i.description ?? undefined,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        customPrice: i.customPrice ? Number(i.customPrice) : undefined,
        packageId: i.packageId ?? undefined,
        packageName: i.packageName ?? undefined,
        saleId: i.saleId,
      })) : undefined,
      activities: sale.activities?.map((activity: any): ISaleActivity => ({
        id: activity.id,
        type: activity.type,
        data: activity.data as Record<string, unknown>,
        userId: activity.userId,
        createdAt: activity.createdAt,
      })) ?? [],
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }
}
