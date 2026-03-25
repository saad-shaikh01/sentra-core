import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '@sentra-core/prisma-client';
import { IInvoice, IPaginatedResponse, InvoiceStatus, TransactionType, TransactionStatus, UserRole, GatewayType, isSalesAgentRole } from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { PaymentGatewayFactory } from '../payment-gateway';
import { ScopeService } from '../scope/scope.service';
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
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
        saleId: dto.saleId,
      },
    });

    await this.cache.delByPrefix(`invoices:${orgId}:`);

    return this.mapToIInvoice(invoice);
  }

  async getSummary(orgId: string, brandId?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const saleWhere = {
      organizationId: orgId,
      deletedAt: null,
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
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
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
        dueDate: true,
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
    return invoice;
  }

  async findAll(orgId: string, query: QueryInvoicesDto, userId: string, role: UserRole): Promise<IPaginatedResponse<IInvoice>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `invoices:${orgId}:${userId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<IInvoice>>(cacheKey);
    if (cached) return cached;

    const { page, limit, search, status, saleId, dueBefore, dueAfter } = query;

    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const invoiceScope = scope.toInvoiceFilter();

    const where: any = {
      sale: {
        is: {
          organizationId: orgId,
          ...(invoiceScope.sale?.is ?? {}),
        },
      },
    };
    if (search) where.invoiceNumber = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    if (saleId) where.saleId = saleId;
    if (dueBefore || dueAfter) {
      where.dueDate = {};
      if (dueAfter) where.dueDate.gte = new Date(dueAfter);
      if (dueBefore) where.dueDate.lte = new Date(dueBefore);
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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

    await this.cache.set(cacheKey, invoice);
    return invoice;
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
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
    });

    await this.cache.delByPrefix(`invoices:${orgId}:`);

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

    return { message: 'Invoice deleted successfully' };
  }

  async generatePdf(id: string, orgId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: { 
          include: { 
            client: true, 
            brand: true,
            items: true,
          } 
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    const themeConfig = (invoice.sale.brand.themeConfig as any) || {};

    return this.pdfService.generatePdf({
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.sale.currency,
      dueDate: invoice.dueDate,
      status: invoice.status,
      notes: invoice.notes ?? undefined,
      client: {
        contactName: invoice.sale.client.contactName ?? undefined,
        email: invoice.sale.client.email,
        phone: invoice.sale.client.phone ?? undefined,
        address: invoice.sale.client.address ?? undefined,
      },
      brand: {
        name: invoice.sale.brand.name,
        logoUrl: invoice.sale.brand.logoUrl ?? undefined,
        website: themeConfig.website ?? undefined,
        email: themeConfig.email ?? undefined,
        phone: themeConfig.phone ?? undefined,
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
      createdAt: invoice.createdAt,
    });
  }

  async pay(id: string, orgId: string, userId?: string, role?: UserRole) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice is already paid');

    const sale = invoice.sale;

    // Agent-level roles: must be the assigned agent on this sale, and only allowed on MANUAL gateway
    if (role && isSalesAgentRole(role)) {
      if (sale.salesAgentId !== userId) {
        throw new ForbiddenException('You are not the assigned agent for this sale');
      }
      if ((sale.gateway ?? GatewayType.MANUAL) !== GatewayType.MANUAL) {
        throw new ForbiddenException('Sales agents can only mark manual payments as paid');
      }
    }

    const gatewayType = (sale.gateway ?? GatewayType.MANUAL) as GatewayType;

    // Manual payment — no gateway involved, just mark as paid
    if (gatewayType === GatewayType.MANUAL) {
      const transaction = await this.prisma.paymentTransaction.create({
        data: {
          transactionId: `MANUAL-${Date.now()}`,
          type: TransactionType.ONE_TIME,
          amount: Number(invoice.amount),
          status: TransactionStatus.SUCCESS,
          gateway: GatewayType.MANUAL,
          responseCode: 'MANUAL',
          responseMessage: 'Manually marked as paid',
          saleId: sale.id,
          invoiceId: id,
        },
      });

      await this.prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.PAID },
      });

      await this.cache.delByPrefix(`invoices:${orgId}:`);

      return { transaction, paid: true };
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

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: result.gatewayTransactionId,
        type: TransactionType.ONE_TIME,
        amount: Number(invoice.amount),
        status: result.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        gateway: gatewayType,
        responseCode: result.responseCode,
        responseMessage: result.message,
        saleId: sale.id,
        invoiceId: id,
      },
    });

    if (result.success) {
      await this.prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.PAID },
      });
    } else {
      throw new BadRequestException(`Payment failed: ${result.message}`);
    }

    await this.cache.delByPrefix(`invoices:${orgId}:`);

    return { transaction, paid: true };
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
      dueDate: invoice.dueDate,
      status: invoice.status as InvoiceStatus,
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
