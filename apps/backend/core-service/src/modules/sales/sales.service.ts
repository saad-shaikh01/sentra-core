import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  ISale,
  ISaleItem,
  IPaginatedResponse,
  SaleStatus,
  UserRole,
  TransactionType,
  TransactionStatus,
  PaymentPlanType,
} from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { TeamsService } from '../teams';
import { CreateSaleDto, UpdateSaleDto, QuerySalesDto, ChargeSaleDto, CreateSubscriptionDto } from './dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private authorizeNet: AuthorizeNetService,
    private cache: CacheService,
    private teams: TeamsService,
  ) {}

  async create(orgId: string, dto: CreateSaleDto): Promise<ISale> {
    // Validate client belongs to same org
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');
    if (client.organizationId !== orgId) throw new BadRequestException('Client belongs to another organization');

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

    const sale = await this.prisma.sale.create({
      data: {
        totalAmount,
        currency: dto.currency || 'USD',
        description: dto.description,
        contractUrl: dto.contractUrl,
        paymentPlan,
        installmentCount: paymentPlan === PaymentPlanType.INSTALLMENTS ? (dto.installmentCount ?? 2) : null,
        clientId: dto.clientId,
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
              })),
            }
          : undefined,
      },
      include: { items: true },
    });

    // Auto-generate invoices based on payment plan
    await this.generateInvoices(sale.id, totalAmount, paymentPlan, sale.installmentCount, sale.currency);

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return this.mapToISale(sale);
  }

  private async generateInvoices(
    saleId: string,
    totalAmount: number,
    plan: PaymentPlanType,
    installmentCount: number | null,
    currency: string,
  ): Promise<void> {
    const now = new Date();

    if (plan === PaymentPlanType.ONE_TIME) {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 7); // due in 7 days
      await this.prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          amount: totalAmount,
          dueDate,
          saleId,
          notes: currency !== 'USD' ? currency : undefined,
        },
      });
    } else if (plan === PaymentPlanType.INSTALLMENTS && installmentCount) {
      const installmentAmount = Math.round((totalAmount / installmentCount) * 100) / 100;
      const invoices: Array<{
        invoiceNumber: string;
        amount: number;
        dueDate: Date;
        saleId: string;
        notes?: string;
      }> = [];
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i + 1);
        // Last installment absorbs rounding difference
        const amount =
          i === installmentCount - 1
            ? Math.round((totalAmount - installmentAmount * (installmentCount - 1)) * 100) / 100
            : installmentAmount;
        invoices.push({
          invoiceNumber: `INV-${Date.now()}-${i + 1}`,
          amount,
          dueDate,
          saleId,
          notes: `Installment ${i + 1} of ${installmentCount}`,
        });
      }
      await this.prisma.invoice.createMany({ data: invoices });
    }
    // SUBSCRIPTION plan: no invoices generated upfront — ARB handles billing
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
    const where: Record<string, any> = { organizationId: orgId };

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
      include: { client: true, invoices: true, transactions: true, items: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    await this.cache.set(cacheKey, sale);
    return sale;
  }

  async update(id: string, orgId: string, dto: UpdateSaleDto): Promise<ISale> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        totalAmount: dto.totalAmount,
        currency: dto.currency,
        description: dto.description,
        contractUrl: dto.contractUrl,
        status: dto.status,
      },
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return this.mapToISale(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const invoiceCount = await this.prisma.invoice.count({ where: { saleId: id } });
    if (invoiceCount > 0) throw new BadRequestException(`Cannot delete sale with ${invoiceCount} invoice(s)`);

    await this.prisma.paymentTransaction.deleteMany({ where: { saleId: id } });
    await this.prisma.saleItem.deleteMany({ where: { saleId: id } });
    await this.prisma.sale.delete({ where: { id } });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { message: 'Sale deleted successfully' };
  }

  async charge(id: string, orgId: string, dto: ChargeSaleDto): Promise<any> {
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
      throw new BadRequestException(`Payment failed: ${result.message}`);
    }

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

  async subscribe(id: string, orgId: string, dto: CreateSubscriptionDto): Promise<any> {
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
      data: { subscriptionId: result.subscriptionId },
    });

    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { subscriptionId: result.subscriptionId };
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
        saleId: i.saleId,
      })) : undefined,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }
}
