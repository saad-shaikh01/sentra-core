import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '@sentra-core/prisma-client';
import { IInvoice, IPaginatedResponse, InvoiceStatus, TransactionType, TransactionStatus, UserRole, GatewayType } from '@sentra-core/types';
import { buildPaginationResponse, CacheService, PermissionsService, StorageService } from '../../common';
import { deriveInvoiceStatus } from '../../common/helpers/sales-domain.helper';
import { PaymentGatewayFactory } from '../payment-gateway';
import { ScopeService } from '../scope/scope.service';
import { SalesService } from '../sales';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoicesDto } from './dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private gatewayFactory: PaymentGatewayFactory,
    private pdfService: InvoicePdfService,
    private cache: CacheService,
    private readonly scopeService: ScopeService,
    private readonly permissionsService: PermissionsService,
    private readonly storage: StorageService,
    private readonly salesService: SalesService,
  ) {}

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `INV-${year}-` } },
      orderBy: { invoiceNumber: 'desc' },
    });
    let sequence = 1;
    if (lastInvoice) {
      const lastSeq = parseInt(lastInvoice.invoiceNumber.split('-')[2], 10);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
    return `INV-${year}-${String(sequence).padStart(4, '0')}`;
  }

  async create(orgId: string, dto: CreateInvoiceDto): Promise<IInvoice> {
    // Verify sale belongs to org
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const invoiceNumber = await this.generateInvoiceNumber();

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        amount: dto.amount,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : sale.saleDate,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
        saleId: dto.saleId,
      },
    });

    await this.cache.delByPrefix(`invoices:${orgId}:`);
    await this.cache.delByPrefix(`sales:${orgId}:`);

    return this.mapToIInvoice(invoice);
  }

  async getSummary(orgId: string, userId: string, role: UserRole, brandId?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const invoiceScope = scope.toInvoiceFilter();
    const scopedSaleFilter = invoiceScope.sale?.is ?? {};

    const saleWhere = {
      organizationId: orgId,
      deletedAt: null,
      ...scopedSaleFilter,
      ...(brandId ? { brandId } : {}),
    };

    const [unpaidAgg, overdueAgg, paidThisMonthAgg, upcomingDueAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: InvoiceStatus.UNPAID, dueDate: { gte: now }, sale: { is: { ...saleWhere } } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          OR: [
            { status: InvoiceStatus.OVERDUE },
            { status: InvoiceStatus.UNPAID, dueDate: { lt: now } },
          ],
          sale: { is: { ...saleWhere } },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.PAID,
          paidAt: { gte: startOfMonth, lte: endOfMonth },
          sale: { is: { ...saleWhere } },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.UNPAID,
          dueDate: { gte: now, lte: sevenDaysFromNow },
          sale: { is: { ...saleWhere } },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      unpaid: { count: unpaidAgg._count.id, total: Number(unpaidAgg._sum.amount ?? 0) },
      overdue: { count: overdueAgg._count.id, total: Number(overdueAgg._sum.amount ?? 0) },
      paidThisMonth: { count: paidThisMonthAgg._count.id, total: Number(paidThisMonthAgg._sum.amount ?? 0) },
      upcomingDue: { count: upcomingDueAgg._count.id, total: Number(upcomingDueAgg._sum.amount ?? 0) },
    };
  }

  async findPublic(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        invoiceDate: true,
        dueDate: true,
        paidAt: true,
        status: true,
        notes: true,
        paymentToken: true,
        sale: {
          select: {
            id: true,
            currency: true,
            description: true,
            gateway: true,
            brand: {
              select: {
                name: true,
                logoUrl: true,
                faviconUrl: true,
                primaryColor: true,
                secondaryColor: true,
                organization: { select: { storageBucket: true } },
              },
            },
            client: {
              select: { contactName: true, email: true },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      ...invoice,
      amount: Number(invoice.amount),
      status: deriveInvoiceStatus(invoice),
    };
  }

  async findAll(orgId: string, query: QueryInvoicesDto, userId: string, role: UserRole): Promise<IPaginatedResponse<IInvoice>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `invoices:${orgId}:${userId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<IInvoice>>(cacheKey);
    if (cached) return cached;

    const { page, limit, search, status, saleId, salesAgentId, brandId, dueBefore, dueAfter } = query;

    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const invoiceScope = scope.toInvoiceFilter();

    const where: any = {
      sale: {
        is: {
          organizationId: orgId,
          ...(invoiceScope.sale?.is ?? {}),
          ...(salesAgentId ? { salesAgentId } : {}),
          ...(brandId ? { brandId } : {}),
        },
      },
    };
    if (search) where.invoiceNumber = { contains: search, mode: 'insensitive' };
    if (status === InvoiceStatus.OVERDUE) {
      where.OR = [
        { status: InvoiceStatus.OVERDUE },
        { status: InvoiceStatus.UNPAID, dueDate: { lt: new Date() } },
      ];
    } else if (status === InvoiceStatus.UNPAID) {
      where.status = InvoiceStatus.UNPAID;
      where.dueDate = { gte: new Date() };
    } else if (status) {
      where.status = status;
    }
    if (saleId) where.saleId = saleId;
    if (dueBefore || dueAfter) {
      const dueDateFilter = {
        ...(where.dueDate ?? {}),
        ...(dueAfter ? { gte: new Date(`${dueAfter}T00:00:00.000Z`) } : {}),
        ...(dueBefore ? { lte: new Date(`${dueBefore}T23:59:59.999Z`) } : {}),
      };
      where.dueDate = dueDateFilter;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { sale: { include: { client: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const result: IPaginatedResponse<IInvoice> = buildPaginationResponse(
      invoices.map((i) => this.mapToIInvoice(i)),
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(id: string, orgId: string) {
    const cacheKey = `invoices:${orgId}:${id}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: { include: { client: true, brand: true } },
        transactions: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    const mappedInvoice = {
      ...this.mapToIInvoice(invoice),
      sale: invoice.sale
        ? {
            ...invoice.sale,
            totalAmount: Number(invoice.sale.totalAmount),
            discountedTotal: invoice.sale.discountedTotal != null ? Number(invoice.sale.discountedTotal) : undefined,
          }
        : undefined,
      transactions: invoice.transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
    };

    await this.cache.set(cacheKey, mappedInvoice);
    return mappedInvoice;
  }

  async update(id: string, orgId: string, dto: UpdateInvoiceDto): Promise<IInvoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        amount: dto.amount,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
    });

    await this.cache.delByPrefix(`invoices:${orgId}:`);
    await this.cache.delByPrefix(`sales:${orgId}:`);

    return this.mapToIInvoice(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    await this.prisma.paymentTransaction.deleteMany({ where: { invoiceId: id } });
    await this.prisma.invoice.delete({ where: { id } });

    await this.cache.delByPrefix(`invoices:${orgId}:`);
    await this.cache.delByPrefix(`sales:${orgId}:`);

    return { message: 'Invoice deleted successfully' };
  }

  async generatePdf(id: string, orgId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            client: true,
            brand: { include: { invoiceConfig: true, organization: true } },
            items: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    const invoiceConfig = (invoice.sale.brand as any).invoiceConfig ?? {};

    return this.pdfService.generatePdf({
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoiceConfig.currency ?? invoice.sale.currency,
      dueDate: invoice.dueDate,
      status: invoice.status,
      notes: invoice.notes ?? invoiceConfig.invoiceNotes ?? undefined,
      client: {
        contactName: invoice.sale.client.contactName ?? undefined,
        email: invoice.sale.client.email,
        phone: invoice.sale.client.phone ?? undefined,
        address: invoice.sale.client.address ?? undefined,
      },
      brand: {
        name: invoice.sale.brand.name,
        logoUrl: this.storage.buildUrl(
          invoice.sale.brand.logoUrl,
          invoice.sale.brand.organization?.storageBucket,
          invoice.sale.brand.organization?.cdnHostname,
        ),
        website: invoiceConfig.website ?? undefined,
        email: invoiceConfig.billingEmail ?? invoiceConfig.supportEmail ?? undefined,
        phone: invoiceConfig.phone ?? undefined,
        address: invoiceConfig.address ?? undefined,
        taxId: invoiceConfig.taxId ?? undefined,
        colors: invoice.sale.brand.colors as Record<string, string> ?? undefined,
      },
      sale: {
        description: invoice.sale.description ?? undefined,
        items: invoice.sale.items.map(item => ({
          name: item.name,
          description: item.description ?? undefined,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.unitPrice) * item.quantity,
        })),
      },
      invoiceTerms: invoiceConfig.invoiceTerms ?? undefined,
      createdAt: invoice.invoiceDate,
    });
  }

  async pay(id: string, orgId: string, userId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice is already paid');

    const sale = invoice.sale;

    // Users without elevated access (no view_all = agent-level): restricted to their own sales, manual gateway only
    if (userId) {
      const hasElevatedAccess = await this.permissionsService.userHasPermission(userId, orgId, 'sales:invoices:edit');
      if (!hasElevatedAccess) {
        if (sale.salesAgentId !== userId) {
          throw new ForbiddenException('You are not the assigned agent for this sale');
        }
        if ((sale.gateway ?? GatewayType.MANUAL) !== GatewayType.MANUAL) {
          throw new ForbiddenException('Sales agents can only mark manual payments as paid');
        }
      }
    }

    const gatewayType = (sale.gateway ?? GatewayType.MANUAL) as GatewayType;

    // Manual payment — no gateway involved, just mark as paid
    if (gatewayType === GatewayType.MANUAL) {
      const paymentResult = await this.salesService.applySuccessfulPayment({
        saleId: sale.id,
        amount: Number(invoice.amount),
        actorId: userId ?? 'system',
        gateway: GatewayType.MANUAL,
        invoiceId: id,
        transactionId: `MANUAL-${Date.now()}`,
        responseCode: 'MANUAL',
        responseMessage: 'Manually marked as paid',
        source: 'invoice_module',
      });

      return { transaction: paymentResult.transaction, paid: true };
    }

    const gateway = this.gatewayFactory.resolve(gatewayType);

    // Resolve IDs — support both legacy Authorize.Net fields and new gateway-agnostic fields
    const gatewayCustomerId = sale.customerProfileId ?? sale.gatewayCustomerId;
    const gatewayPaymentMethodId = sale.paymentProfileId ?? sale.gatewayPaymentMethodId;

    if (!gatewayCustomerId || !gatewayPaymentMethodId) {
      throw new BadRequestException('Sale does not have payment profiles configured');
    }

    const result = await gateway.chargeOnce({
      gatewayCustomerId,
      gatewayPaymentMethodId,
      amount: Number(invoice.amount),
      invoiceNumber: invoice.invoiceNumber,
    });

    if (!result.success) {
      await this.prisma.paymentTransaction.create({
        data: {
          transactionId: result.gatewayTransactionId,
          type: TransactionType.ONE_TIME,
          amount: Number(invoice.amount),
          status: TransactionStatus.FAILED,
          gateway: gatewayType,
          responseCode: result.responseCode,
          responseMessage: result.message,
          saleId: sale.id,
          invoiceId: id,
        },
      });

      throw new BadRequestException(`Payment failed: ${result.message}`);
    }

    const paymentResult = await this.salesService.applySuccessfulPayment({
      saleId: sale.id,
      amount: Number(invoice.amount),
      actorId: userId ?? 'system',
      gateway: gatewayType,
      invoiceId: id,
      transactionId: result.gatewayTransactionId ?? null,
      responseCode: result.responseCode ?? null,
      responseMessage: result.message ?? null,
      source: 'invoice_module',
    });

    return { transaction: paymentResult.transaction, paid: true };
  }

  async regenerateToken(invoiceId: string, orgId: string): Promise<{ paymentToken: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        sale: { organizationId: orgId },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const paymentToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentToken },
    });
    return { paymentToken };
  }

  private mapToIInvoice(invoice: any): IInvoice {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      invoiceDate: invoice.invoiceDate ?? invoice.createdAt,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt ?? undefined,
      status: deriveInvoiceStatus(invoice),
      pdfUrl: invoice.pdfUrl ?? undefined,
      notes: invoice.notes ?? undefined,
      paymentToken: invoice.paymentToken ?? undefined,
      saleId: invoice.saleId,
      clientName: invoice.sale?.client
        ? (invoice.sale.client.contactName ?? invoice.sale.client.email)
        : undefined,
      salesAgentId: invoice.sale?.salesAgentId ?? undefined,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }
}
