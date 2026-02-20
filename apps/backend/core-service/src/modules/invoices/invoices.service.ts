import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IInvoice, IPaginatedResponse, InvoiceStatus, TransactionType, TransactionStatus } from '@sentra-core/types';
import { buildPaginationResponse } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoicesDto } from './dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private authorizeNet: AuthorizeNetService,
    private pdfService: InvoicePdfService,
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

    return this.mapToIInvoice(invoice);
  }

  async findAll(orgId: string, query: QueryInvoicesDto): Promise<IPaginatedResponse<IInvoice>> {
    const { page, limit, status, saleId, dueBefore, dueAfter } = query;

    // We need to join through sale to filter by org
    const where: any = { sale: { organizationId: orgId } };
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

    return buildPaginationResponse(invoices.map(i => this.mapToIInvoice(i)), total, page, limit);
  }

  async findOne(id: string, orgId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: { include: { client: true, brand: true } },
        transactions: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');
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
    return { message: 'Invoice deleted successfully' };
  }

  async generatePdf(id: string, orgId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: { include: { client: true, brand: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');

    return this.pdfService.generatePdf({
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.sale.currency,
      dueDate: invoice.dueDate,
      status: invoice.status,
      notes: invoice.notes ?? undefined,
      client: {
        companyName: invoice.sale.client.companyName,
        contactName: invoice.sale.client.contactName ?? undefined,
        email: invoice.sale.client.email,
        phone: invoice.sale.client.phone ?? undefined,
        address: invoice.sale.client.address ?? undefined,
      },
      brand: {
        name: invoice.sale.brand.name,
        logoUrl: invoice.sale.brand.logoUrl ?? undefined,
        colors: invoice.sale.brand.colors as Record<string, string> ?? undefined,
      },
      sale: {
        description: invoice.sale.description ?? undefined,
      },
      createdAt: invoice.createdAt,
    });
  }

  async pay(id: string, orgId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { sale: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sale.organizationId !== orgId) throw new ForbiddenException('Invoice belongs to another organization');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice is already paid');

    const sale = invoice.sale;
    if (!sale.customerProfileId || !sale.paymentProfileId) {
      throw new BadRequestException('Sale does not have payment profiles configured');
    }

    const result = await this.authorizeNet.chargeCustomerProfile({
      customerProfileId: sale.customerProfileId,
      paymentProfileId: sale.paymentProfileId,
      amount: Number(invoice.amount),
      invoiceNumber: invoice.invoiceNumber,
    });

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        transactionId: result.transactionId,
        type: TransactionType.ONE_TIME,
        amount: Number(invoice.amount),
        status: result.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
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

    return { transaction, paid: true };
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
      saleId: invoice.saleId,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }
}
