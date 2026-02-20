import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ISale, IPaginatedResponse, SaleStatus, TransactionType, TransactionStatus } from '@sentra-core/types';
import { buildPaginationResponse } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { CreateSaleDto, UpdateSaleDto, QuerySalesDto, ChargeSaleDto, CreateSubscriptionDto } from './dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private authorizeNet: AuthorizeNetService,
  ) {}

  async create(orgId: string, dto: CreateSaleDto): Promise<ISale> {
    // Validate client belongs to same org
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');
    if (client.organizationId !== orgId) throw new BadRequestException('Client belongs to another organization');

    const sale = await this.prisma.sale.create({
      data: {
        totalAmount: dto.totalAmount,
        currency: dto.currency || 'USD',
        description: dto.description,
        clientId: dto.clientId,
        brandId: dto.brandId,
        organizationId: orgId,
      },
    });

    return this.mapToISale(sale);
  }

  async findAll(orgId: string, query: QuerySalesDto): Promise<IPaginatedResponse<ISale>> {
    const { page, limit, status, clientId, brandId, dateFrom, dateTo } = query;
    const where: any = { organizationId: orgId };
    if (status) where.status = status;
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
        include: { client: true },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return buildPaginationResponse(sales.map(s => this.mapToISale(s)), total, page, limit);
  }

  async findOne(id: string, orgId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true, invoices: true, transactions: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');
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
        status: dto.status,
      },
    });

    return this.mapToISale(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');

    const invoiceCount = await this.prisma.invoice.count({ where: { saleId: id } });
    if (invoiceCount > 0) throw new BadRequestException(`Cannot delete sale with ${invoiceCount} invoice(s)`);

    await this.prisma.paymentTransaction.deleteMany({ where: { saleId: id } });
    await this.prisma.sale.delete({ where: { id } });
    return { message: 'Sale deleted successfully' };
  }

  async charge(id: string, orgId: string, dto: ChargeSaleDto): Promise<any> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.organizationId !== orgId) throw new ForbiddenException('Sale belongs to another organization');
    if (!sale.customerProfileId || !sale.paymentProfileId) {
      throw new BadRequestException('Sale does not have payment profiles configured');
    }

    const result = await this.authorizeNet.chargeCustomerProfile({
      customerProfileId: sale.customerProfileId,
      paymentProfileId: sale.paymentProfileId,
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
      },
    });

    if (!result.success) {
      throw new BadRequestException(`Payment failed: ${result.message}`);
    }

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

    return { message: 'Subscription cancelled successfully' };
  }

  private mapToISale(sale: any): ISale {
    return {
      id: sale.id,
      totalAmount: Number(sale.totalAmount),
      status: sale.status as SaleStatus,
      currency: sale.currency,
      description: sale.description ?? undefined,
      clientId: sale.clientId,
      brandId: sale.brandId,
      organizationId: sale.organizationId,
      customerProfileId: sale.customerProfileId ?? undefined,
      paymentProfileId: sale.paymentProfileId ?? undefined,
      subscriptionId: sale.subscriptionId ?? undefined,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }
}
