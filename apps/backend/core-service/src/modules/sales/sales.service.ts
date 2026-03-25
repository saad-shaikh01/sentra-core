import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Prisma,
  PrismaService,
  UserRole as PrismaUserRole,
  NotificationHelper,
  NOTIFICATION_QUEUE,
} from '@sentra-core/prisma-client';
import * as crypto from 'crypto';
import {
  ISale,
  ISaleActivity,
  ISaleCreateResponse,
  ISaleItem,
  ISalePackage,
  IClientCollisionWarning,
  ICustomInstallment,
  IPaginatedResponse,
  SaleStatus,
  UserRole,
  TransactionType,
  TransactionStatus,
  PaymentPlanType,
  InstallmentMode,
  DiscountType,
  SaleActivityType,
  LeadActivityType,
  LeadStatus,
  ClientActivityType,
  InvoiceStatus,
  GatewayType,
} from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { PaymentGatewayFactory } from '../payment-gateway';
import { ScopeService } from '../scope/scope.service';
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
  RecordManualPaymentDto,
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
  private readonly notificationHelper: NotificationHelper;

  constructor(
    private prisma: PrismaService,
    private gatewayFactory: PaymentGatewayFactory,
    private cache: CacheService,
    private salesNotificationService: SalesNotificationService,
    private readonly scopeService: ScopeService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
  ) {
    this.notificationHelper = new NotificationHelper(notifQueue);
  }

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
    const installmentMode = paymentPlan === PaymentPlanType.INSTALLMENTS
      ? (dto.installmentMode ?? InstallmentMode.EQUAL)
      : undefined;

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

    // Validate custom installments if applicable
    if (installmentMode === InstallmentMode.CUSTOM) {
      if (!dto.customInstallments || dto.customInstallments.length < 2) {
        throw new BadRequestException('Custom installment plan requires at least 2 installments');
      }
      const effectiveTotal = discountedTotal ?? totalAmount;
      const customSum = Math.round(
        dto.customInstallments.reduce((s, i) => s + i.amount, 0) * 100,
      ) / 100;
      if (Math.abs(customSum - effectiveTotal) > 0.01) {
        throw new BadRequestException(
          `Custom installment amounts (${customSum}) must equal the sale total (${effectiveTotal})`,
        );
      }
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
          saleType: dto.saleType ?? null,
          salesAgentId: dto.salesAgentId ?? null,
          currency: dto.currency || 'USD',
          description: dto.description,
          contractUrl: dto.contractUrl,
          discountType: dto.discountType ?? null,
          discountValue: dto.discountValue ?? null,
          discountedTotal: discountedTotal ?? null,
          paymentPlan,
          installmentCount: paymentPlan === PaymentPlanType.INSTALLMENTS && installmentMode === InstallmentMode.EQUAL
            ? (dto.installmentCount ?? 2)
            : null,
          installmentMode: installmentMode ?? null,
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
        installmentMode,
        dto.customInstallments,
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

    if (dto.salePackage) {
      await this.prisma.salePackage.create({
        data: {
          saleId: sale.id,
          packageId: dto.salePackage.packageId ?? null,
          name: dto.salePackage.name,
          price: dto.salePackage.price,
          currency: dto.salePackage.currency ?? 'USD',
          category: dto.salePackage.category ?? null,
          services: {
            create: (dto.salePackage.services ?? []).map((s, i) => ({ name: s.name, order: s.order ?? i })),
          },
        },
      });
    }

    if (dto.leadId) {
      await this.cache.delByPrefix(`leads:${orgId}:`);
      await this.cache.delByPrefix(`clients:${orgId}:`);
    }
    await this.cache.delByPrefix(`sales:${orgId}:`);

    if (dto.description) {
      try {
        const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
        await this.notificationHelper.notifyMentions({
          content: dto.description,
          context: `in Sale "${sale.id}"`,
          url: `/dashboard/sales/${sale.id}`,
          entityType: 'sale',
          entityId: sale.id,
          actorId,
          actorName: actor?.name ?? actorId,
          organizationId: orgId,
          module: 'SALES',
        });
      } catch (err) {
        this.logger.error('notifyMentions failed on sale create (non-fatal):', err);
      }
    }

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
    // Frontsell path: agent owns a lead that was converted to this client
    const lead = await this.prisma.lead.findFirst({
      where: {
        organizationId,
        assignedToId: actorId,
        convertedClientId: clientId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (lead) return;

    // Upsell path: agent is directly assigned as the upsell agent on the client
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        organizationId,
        upsellAgentId: actorId,
      },
      select: { id: true },
    });

    if (!client) {
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

    const result = await tx.$queryRaw<Array<{ lastSeq: number }>>`
      INSERT INTO "InvoiceSequence" ("id", "brandId", "year", "lastSeq")
      VALUES (gen_random_uuid()::text, ${brandId}, ${currentYear}, 1)
      ON CONFLICT ("brandId") DO UPDATE
      SET
        "lastSeq" = CASE
          WHEN "InvoiceSequence"."year" = ${currentYear} THEN "InvoiceSequence"."lastSeq" + 1
          ELSE 1
        END,
        "year" = ${currentYear}
      RETURNING "lastSeq"
    `;

    const paddedSeq = String(result[0].lastSeq).padStart(4, '0');
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
    installmentMode?: InstallmentMode,
    customInstallments?: ICustomInstallment[],
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

    if (plan === PaymentPlanType.INSTALLMENTS) {
      // Custom schedule
      if (installmentMode === InstallmentMode.CUSTOM && customInstallments?.length) {
        const invoices: Array<{ id: string; invoiceNumber: string; amount: any; dueDate: Date }> = [];
        const total = customInstallments.length;
        for (let i = 0; i < total; i++) {
          const item = customInstallments[i];
          const dueDate = item.dueDate
            ? new Date(item.dueDate)
            : (() => { const d = new Date(now); d.setMonth(d.getMonth() + i + 1); return d; })();
          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber: await this.getNextInvoiceNumber(tx, brandId),
              amount: item.amount,
              dueDate,
              saleId,
              paymentToken: crypto.randomBytes(32).toString('hex'),
              notes: item.note ?? `Installment ${i + 1} of ${total}`,
            },
          });
          invoices.push(invoice);
        }
        return invoices;
      }

      // Equal split (existing behavior)
      if (installmentCount) {
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
            select: { id: true, email: true, contactName: true },
          })
        : null;

      const client =
        reusableClient ??
        (await tx.client.create({
          data: {
            email: lead.email ?? this.buildPlaceholderEmail(lead.id),
            contactName: lead.name ?? undefined,
            phone: lead.phone ?? undefined,
            brandId: lead.brandId,
            organizationId: orgId,
            portalAccess: false,
          },
          select: { id: true, email: true, contactName: true },
        }));

      const collisionWarning = reusableClient && reusableClient.id !== lead.convertedClientId
        ? {
            matched: true,
            matchedClientId: reusableClient.id,
            matchedClientName: reusableClient.contactName ?? reusableClient.email,
          }
        : undefined;

      if (!reusableClient) {
        await tx.clientActivity.create({
          data: {
            type: ClientActivityType.CREATED,
            data: { email: client.email, trigger: 'first_sale' },
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

  async findAll(
    orgId: string,
    query: QuerySalesDto,
    userId: string,
    role: UserRole,
  ): Promise<IPaginatedResponse<ISale>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `sales:${orgId}:${userId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<ISale>>(cacheKey);
    if (cached) return cached;

    const { page, limit, search, status, clientId, brandId, dateFrom, dateTo, salesAgentId, saleType } = query;

    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const scopeWhere = scope.toSaleFilter();

    const where: Record<string, any> = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { client: { contactName: { contains: search, mode: 'insensitive' } } },
        { client: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status as SaleStatus;
    if (clientId) where.clientId = clientId;
    if (brandId) {
      const scopeBrandIds = (scopeWhere as any).brandId?.in as string[] | undefined;
      if (scopeBrandIds && !scopeBrandIds.includes(brandId)) {
        where.id = { in: [] }; // out-of-scope brand → guaranteed empty result
      } else {
        where.brandId = brandId;
      }
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (salesAgentId) where.salesAgentId = salesAgentId;
    if (saleType) where.saleType = saleType;

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { client: true, items: true, salePackage: { include: { services: { orderBy: { order: 'asc' } } } } },
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

  async getSummary(
    orgId: string,
    query: { brandId?: string; dateFrom?: string; dateTo?: string },
  ) {
    const { brandId, dateFrom, dateTo } = query;
    const baseWhere: Prisma.SaleWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(brandId ? { brandId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [completedAgg, activeAgg, pendingDraftAgg, cancelledAgg, refundedAgg] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...baseWhere, status: SaleStatus.COMPLETED },
          _sum: { discountedTotal: true, totalAmount: true },
          _count: { id: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...baseWhere, status: { in: [SaleStatus.ACTIVE, SaleStatus.ON_HOLD] } },
          _sum: { discountedTotal: true, totalAmount: true },
          _count: { id: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...baseWhere, status: { in: [SaleStatus.PENDING, SaleStatus.DRAFT] } },
          _sum: { discountedTotal: true, totalAmount: true },
          _count: { id: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...baseWhere, status: SaleStatus.CANCELLED },
          _sum: { discountedTotal: true, totalAmount: true },
          _count: { id: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...baseWhere, status: SaleStatus.REFUNDED },
          _sum: { discountedTotal: true, totalAmount: true },
          _count: { id: true },
        }),
      ]);

    const resolveAmount = (agg: { _sum: { discountedTotal: unknown; totalAmount: unknown }; _count: { id: number } }) =>
      Number((agg._sum.discountedTotal ?? agg._sum.totalAmount) ?? 0);

    return {
      totalRevenue: resolveAmount(completedAgg),
      totalRevenueCount: completedAgg._count.id,
      activeRevenue: resolveAmount(activeAgg),
      activeRevenueCount: activeAgg._count.id,
      pendingRevenue: resolveAmount(pendingDraftAgg),
      pendingRevenueCount: pendingDraftAgg._count.id,
      cancelledRevenue: resolveAmount(cancelledAgg),
      cancelledCount: cancelledAgg._count.id,
      refundedRevenue: resolveAmount(refundedAgg),
      refundedCount: refundedAgg._count.id,
    };
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
        salePackage: { include: { services: { orderBy: { order: 'asc' } } } },
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
                type: 'INVOICE_OVERDUE',
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

    const mappedSale = {
      ...this.mapToISale(sale),
      client: sale.client ?? undefined,
      invoices: sale.invoices ?? [],
      transactions: sale.transactions ?? [],
    };
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
      // If the agent is the assigned salesAgent on this sale they may update it;
      // otherwise verify they own the underlying client relationship.
      if (sale.salesAgentId !== actorId) {
        await this.validateAgentClientScope(sale.clientId, actorId, orgId);
      }

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
        saleType: dto.saleType,
        salesAgentId: dto.salesAgentId,
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
            type: 'SALE_STATUS_CHANGED',
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

    if (dto.salePackage !== undefined) {
      const existing = await this.prisma.salePackage.findUnique({ where: { saleId: id } });
      if (existing) {
        await this.prisma.salePackageService.deleteMany({ where: { salePackageId: existing.id } });
        await this.prisma.salePackage.update({
          where: { id: existing.id },
          data: {
            packageId: dto.salePackage.packageId ?? null,
            name: dto.salePackage.name,
            price: dto.salePackage.price,
            currency: dto.salePackage.currency ?? 'USD',
            category: dto.salePackage.category ?? null,
            services: { create: (dto.salePackage.services ?? []).map((s, i) => ({ name: s.name, order: s.order ?? i })) },
          },
        });
      } else {
        await this.prisma.salePackage.create({
          data: {
            saleId: id,
            packageId: dto.salePackage.packageId ?? null,
            name: dto.salePackage.name,
            price: dto.salePackage.price,
            currency: dto.salePackage.currency ?? 'USD',
            category: dto.salePackage.category ?? null,
            services: { create: (dto.salePackage.services ?? []).map((s, i) => ({ name: s.name, order: s.order ?? i })) },
          },
        });
      }
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

    if (dto.description) {
      try {
        const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
        await this.notificationHelper.notifyMentions({
          content: dto.description,
          context: `in Sale "${updated.id}"`,
          url: `/dashboard/sales/${updated.id}`,
          entityType: 'sale',
          entityId: updated.id,
          actorId,
          actorName: actor?.name ?? actorId,
          organizationId: orgId,
          module: 'SALES',
        });
      } catch (err) {
        this.logger.error('notifyMentions failed on sale update (non-fatal):', err);
      }
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

    // Detect gateway from payload — stripePaymentMethodId → STRIPE, opaqueData → AUTHORIZE_NET,
    // neither (saved profile) → use whatever is already stored on the sale.
    const detectedGatewayType: GatewayType = dto.stripePaymentMethodId
      ? GatewayType.STRIPE
      : dto.opaqueData
      ? GatewayType.AUTHORIZE_NET
      : (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType;

    const gateway = this.gatewayFactory.resolve(detectedGatewayType);

    // Resolve profile IDs — support both legacy Authorize.Net fields and new gateway-agnostic fields
    let gatewayCustomerId = sale.customerProfileId ?? sale.gatewayCustomerId ?? null;
    let gatewayPaymentMethodId = sale.paymentProfileId ?? sale.gatewayPaymentMethodId ?? null;

    // Auto-create customer/payment profiles from provided token if not yet linked
    if (!gatewayCustomerId && (dto.opaqueData || dto.stripePaymentMethodId)) {
      const profileResult = await gateway.createCustomer({
        email: sale.client.email,
        description: `${sale.client.contactName ?? sale.client.email} - Sale ${sale.id}`,
      });
      if (!profileResult.success || !profileResult.gatewayCustomerId) {
        throw new BadRequestException(`Failed to create customer profile: ${profileResult.message}`);
      }
      gatewayCustomerId = profileResult.gatewayCustomerId;

      const saveData: Record<string, string> = { gatewayCustomerId, gateway: detectedGatewayType };
      if (detectedGatewayType === GatewayType.AUTHORIZE_NET) saveData.customerProfileId = gatewayCustomerId;
      await this.prisma.sale.update({ where: { id }, data: saveData });
    }

    if (!gatewayPaymentMethodId && (dto.opaqueData || dto.stripePaymentMethodId)) {
      if (!gatewayCustomerId) {
        throw new BadRequestException('Cannot create payment method: customer profile not found');
      }
      const pmResult = await gateway.createPaymentMethod({
        gatewayCustomerId,
        opaqueData: dto.opaqueData,
        stripePaymentMethodId: dto.stripePaymentMethodId,
      });
      if (!pmResult.success || !pmResult.gatewayPaymentMethodId) {
        throw new BadRequestException(`Failed to create payment profile: ${pmResult.message}`);
      }
      gatewayPaymentMethodId = pmResult.gatewayPaymentMethodId;

      const saveData: Record<string, string> = { gatewayPaymentMethodId };
      if (detectedGatewayType === GatewayType.AUTHORIZE_NET) saveData.paymentProfileId = gatewayPaymentMethodId;
      await this.prisma.sale.update({ where: { id }, data: saveData });
    }

    if (!gatewayCustomerId || !gatewayPaymentMethodId) {
      throw new BadRequestException(
        'Sale does not have payment profiles configured. Provide opaqueData or stripePaymentMethodId to link a payment method.',
      );
    }

    const gatewayType = detectedGatewayType;

    const result = await gateway.chargeOnce({
      gatewayCustomerId,
      gatewayPaymentMethodId,
      amount: dto.amount,
      invoiceNumber: dto.invoiceNumber,
    });

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: result.gatewayTransactionId,
        type: TransactionType.ONE_TIME,
        amount: dto.amount,
        status: result.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        gateway: gatewayType,
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
        gateway: gatewayType,
      });

      this.salesNotificationService
        .resolveRecipientsByRole(sale.organizationId, [
          PrismaUserRole.OWNER,
          PrismaUserRole.ADMIN,
          PrismaUserRole.SALES_MANAGER,
        ])
        .then((recipients) =>
          this.salesNotificationService.dispatch({
            type: 'PAYMENT_FAILED',
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
      transactionId: result.gatewayTransactionId,
      amount: Number(dto.amount),
      invoiceId: dto.invoiceId ?? null,
      gateway: gatewayType,
    });

    if (dto.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { status: 'PAID' },
      });
    }

    if (sale.status === SaleStatus.PENDING) {
      await this.prisma.sale.update({
        where: { id },
        data: { status: SaleStatus.ACTIVE },
      });
      await this.logActivity(this.prisma, id, actorId, SaleActivityType.STATUS_CHANGE, {
        from: SaleStatus.PENDING,
        to: SaleStatus.ACTIVE,
        trigger: 'gateway_payment_received',
        gateway: gatewayType,
      });
    }

    await this.cache.del(`sales:${orgId}:${id}`);

    return { transaction, gatewayResponse: result };
  }

  async recordPayment(
    id: string,
    orgId: string,
    actorId: string,
    dto: RecordManualPaymentDto,
  ): Promise<{ transaction: any; message: string }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: null,
        type: TransactionType.ONE_TIME,
        amount: dto.amount,
        status: TransactionStatus.SUCCESS,
        gateway: 'MANUAL',
        externalRef: dto.externalRef ?? null,
        responseMessage: dto.note,
        saleId: id,
        invoiceId: dto.invoiceId ?? null,
      },
    });

    if (dto.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { status: 'PAID' },
      });
    }

    if (sale.status === SaleStatus.PENDING) {
      await this.prisma.sale.update({
        where: { id },
        data: { status: SaleStatus.ACTIVE },
      });
      await this.logActivity(this.prisma, id, actorId, SaleActivityType.STATUS_CHANGE, {
        from: SaleStatus.PENDING,
        to: SaleStatus.ACTIVE,
        trigger: 'manual_payment_recorded',
      });
    }

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.PAYMENT_RECEIVED, {
      amount: Number(dto.amount),
      invoiceId: dto.invoiceId ?? null,
      source: 'manual',
      externalRef: dto.externalRef ?? null,
      note: dto.note,
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { transaction, message: 'Payment recorded successfully' };
  }

  async subscribe(id: string, orgId: string, actorId: string, dto: CreateSubscriptionDto): Promise<any> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const existingSubId = sale.subscriptionId ?? sale.gatewaySubscriptionId;
    if (existingSubId) {
      throw new BadRequestException('Sale already has an active subscription');
    }

    // Detect gateway from payload — same logic as charge()
    const detectedGatewayType: GatewayType = dto.stripePaymentMethodId
      ? GatewayType.STRIPE
      : dto.opaqueData
      ? GatewayType.AUTHORIZE_NET
      : (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType;

    const gatewayType = detectedGatewayType;
    const gateway = this.gatewayFactory.resolve(gatewayType);

    let gatewayCustomerId = sale.customerProfileId ?? sale.gatewayCustomerId ?? null;
    let gatewayPaymentMethodId = sale.paymentProfileId ?? sale.gatewayPaymentMethodId ?? null;

    // Auto-create customer/payment profiles from provided token if not yet linked
    if (!gatewayCustomerId && (dto.opaqueData || dto.stripePaymentMethodId)) {
      const profileResult = await gateway.createCustomer({
        email: sale.client.email,
        description: `${sale.client.contactName ?? sale.client.email} - Sale ${sale.id}`,
      });
      if (!profileResult.success || !profileResult.gatewayCustomerId) {
        throw new BadRequestException(`Failed to create customer profile: ${profileResult.message}`);
      }
      gatewayCustomerId = profileResult.gatewayCustomerId;
      // Lock gateway on first real charge
      const saveData: Record<string, string> = { gatewayCustomerId, gateway: detectedGatewayType };
      if (gatewayType === GatewayType.AUTHORIZE_NET) saveData.customerProfileId = gatewayCustomerId;
      await this.prisma.sale.update({ where: { id }, data: saveData });
    }

    if (!gatewayPaymentMethodId && (dto.opaqueData || dto.stripePaymentMethodId)) {
      if (!gatewayCustomerId) {
        throw new BadRequestException('Cannot create payment method: customer profile not found');
      }
      const pmResult = await gateway.createPaymentMethod({
        gatewayCustomerId,
        opaqueData: dto.opaqueData,
        stripePaymentMethodId: dto.stripePaymentMethodId,
      });
      if (!pmResult.success || !pmResult.gatewayPaymentMethodId) {
        throw new BadRequestException(`Failed to create payment profile: ${pmResult.message}`);
      }
      gatewayPaymentMethodId = pmResult.gatewayPaymentMethodId;
      const saveData: Record<string, string> = { gatewayPaymentMethodId };
      if (gatewayType === GatewayType.AUTHORIZE_NET) saveData.paymentProfileId = gatewayPaymentMethodId;
      await this.prisma.sale.update({ where: { id }, data: saveData });
    }

    if (!gatewayCustomerId || !gatewayPaymentMethodId) {
      throw new BadRequestException(
        'Sale does not have payment profiles configured. Provide opaqueData or stripePaymentMethodId to link a payment method.',
      );
    }

    const result = await gateway.createSubscription({
      name: dto.name,
      intervalLength: dto.intervalLength,
      intervalUnit: dto.intervalUnit,
      startDate: dto.startDate,
      totalOccurrences: dto.totalOccurrences,
      amount: dto.amount,
      currency: sale.currency,
      gatewayCustomerId,
      gatewayPaymentMethodId,
    });

    if (!result.success) {
      throw new BadRequestException(`Subscription creation failed: ${result.message}`);
    }

    const updateData: Record<string, any> = {
      gatewaySubscriptionId: result.gatewaySubscriptionId,
      status: SaleStatus.ACTIVE,
    };
    // Also persist to legacy field for Authorize.Net
    if (gatewayType === GatewayType.AUTHORIZE_NET) {
      updateData.subscriptionId = result.gatewaySubscriptionId;
    }

    await this.prisma.sale.update({ where: { id }, data: updateData });

    await this.logActivity(this.prisma, id, actorId, SaleActivityType.STATUS_CHANGE, {
      from: sale.status,
      to: SaleStatus.ACTIVE,
      trigger: 'subscription_activated',
      subscriptionId: result.gatewaySubscriptionId,
      gateway: gatewayType,
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { subscriptionId: result.gatewaySubscriptionId };
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
      | { success: boolean; gatewayTransactionId?: string; responseCode?: string; message?: string }
      | undefined;

    if (dto.type === RefundType.FULL || dto.type === RefundType.PARTIAL) {
      const gatewayType = (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType;
      const gateway = this.gatewayFactory.resolve(gatewayType);
      gatewayResult = await gateway.refund({
        transactionId: dto.transactionId!,
        amount: refundAmount,
        cardLastFour: dto.cardLastFour,
      });
    }

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: gatewayResult?.gatewayTransactionId ?? null,
        type: TransactionType.REFUND,
        amount: refundAmount,
        status:
          dto.type === RefundType.MANUAL
            ? TransactionStatus.SUCCESS
            : gatewayResult?.success
              ? TransactionStatus.SUCCESS
              : TransactionStatus.FAILED,
        gateway: (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType,
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
          type: 'CHARGEBACK_FILED',
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

    const subscriptionId = sale.subscriptionId ?? sale.gatewaySubscriptionId;
    if (!subscriptionId) throw new BadRequestException('Sale does not have an active subscription');

    const gatewayType = (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType;
    const gateway = this.gatewayFactory.resolve(gatewayType);

    const result = await gateway.cancelSubscription(subscriptionId);
    if (!result.success) throw new BadRequestException(`Cancellation failed: ${result.message}`);

    await this.prisma.sale.update({
      where: { id },
      data: {
        subscriptionId: null,
        gatewaySubscriptionId: null,
      },
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
      installmentMode: (sale.installmentMode as InstallmentMode | null) ?? undefined,
      discountType: sale.discountType ?? undefined,
      discountValue: sale.discountValue != null ? Number(sale.discountValue) : undefined,
      discountedTotal: sale.discountedTotal != null ? Number(sale.discountedTotal) : undefined,
      clientId: sale.clientId,
      brandId: sale.brandId,
      organizationId: sale.organizationId,
      gateway: sale.gateway ?? undefined,
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
      salePackage: sale.salePackage ? ((): ISalePackage => ({
        id: sale.salePackage.id,
        name: sale.salePackage.name,
        price: Number(sale.salePackage.price),
        currency: sale.salePackage.currency,
        category: sale.salePackage.category ?? undefined,
        packageId: sale.salePackage.packageId ?? undefined,
        saleId: sale.salePackage.saleId,
        services: (sale.salePackage.services ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          order: s.order,
          salePackageId: s.salePackageId,
        })),
        createdAt: sale.salePackage.createdAt,
        updatedAt: sale.salePackage.updatedAt,
      }))() : undefined,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }
}
