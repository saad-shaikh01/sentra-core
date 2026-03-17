import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { AuthorizeNetService } from '../authorize-net/authorize-net.service';
import { PublicInvoiceDto } from './dto/public-invoice.dto';
import { PublicPaymentDto } from './dto/public-payment.dto';

@Injectable()
export class PublicPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizeNetService: AuthorizeNetService,
  ) {}

  async getInvoiceByToken(token: string): Promise<PublicInvoiceDto> {
    if (!token) {
      throw new NotFoundException('Invoice not found');
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentToken: token },
      include: {
        sale: {
          include: {
            brand: {
              select: { name: true, logoUrl: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const alreadyPaid = invoice.status === 'PAID';

    return {
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.sale.currency,
      dueDate: invoice.dueDate.toISOString(),
      status: invoice.status as 'UNPAID' | 'PAID' | 'OVERDUE',
      alreadyPaid,
      saleDescription: invoice.sale.description ?? undefined,
      installmentNote: invoice.notes ?? undefined,
      brand: {
        name: invoice.sale.brand.name,
        logoUrl: invoice.sale.brand.logoUrl ?? undefined,
      },
      paymentToken: token,
    };
  }

  async payInvoice(token: string, dto: PublicPaymentDto): Promise<{
    success: boolean;
    invoiceNumber?: string;
    amountCharged?: number;
    alreadyPaid?: boolean;
    message: string;
    retryable?: boolean;
  }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentToken: token },
      include: {
        sale: {
          include: {
            client: { select: { email: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      return {
        success: true,
        alreadyPaid: true,
        invoiceNumber: invoice.invoiceNumber,
        message: 'Invoice already paid',
      };
    }

    if (invoice.status !== 'UNPAID' && invoice.status !== 'OVERDUE') {
      throw new UnprocessableEntityException('Invoice cannot be paid in its current state');
    }

    const sale = invoice.sale;
    const amount = Number(invoice.amount);
    const payerEmail = dto.payer?.email ?? sale.client.email ?? 'noreply@placeholder.com';

    let { customerProfileId, paymentProfileId } = sale;

    if (!customerProfileId) {
      const profileResult = await this.authorizeNetService.createCustomerProfile({
        email: payerEmail,
        description: `Public payment for sale ${sale.id}`,
      });
      if (!profileResult.success || !profileResult.customerProfileId) {
        return {
          success: false,
          message: 'Unable to process payment. Please try again.',
          retryable: true,
        };
      }
      customerProfileId = profileResult.customerProfileId;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { customerProfileId },
      });
    }

    if (!paymentProfileId) {
      const ppResult = await this.authorizeNetService.createPaymentProfile({
        customerProfileId,
        opaqueData: dto.opaqueData,
      });
      if (!ppResult.success || !ppResult.paymentProfileId) {
        return {
          success: false,
          message: 'Unable to process payment. Please check your card details.',
          retryable: true,
        };
      }
      paymentProfileId = ppResult.paymentProfileId;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { paymentProfileId },
      });
    }

    const chargeResult = await this.authorizeNetService.chargeCustomerProfile({
      customerProfileId,
      paymentProfileId,
      amount,
      invoiceNumber: invoice.invoiceNumber,
    });

    if (chargeResult.success) {
      const wasPending = sale.status === 'PENDING';

      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID' },
        });

        await tx.paymentTransaction.create({
          data: {
            type: 'ONE_TIME',
            amount,
            status: 'SUCCESS',
            transactionId: chargeResult.transactionId ?? null,
            responseCode: chargeResult.responseCode ?? null,
            saleId: sale.id,
            invoiceId: invoice.id,
          },
        });

        if (wasPending) {
          await tx.sale.update({
            where: { id: sale.id },
            data: { status: 'ACTIVE' },
          });
        }

        await tx.saleActivity.create({
          data: {
            type: 'PAYMENT_RECEIVED',
            saleId: sale.id,
            userId: 'system',
            data: {
              amount,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              source: 'public_payment_link',
              transactionId: chargeResult.transactionId,
            },
          },
        });

        if (wasPending) {
          await tx.saleActivity.create({
            data: {
              type: 'STATUS_CHANGE',
              saleId: sale.id,
              userId: 'system',
              data: { from: 'PENDING', to: 'ACTIVE', trigger: 'first_public_payment' },
            },
          });
        }
      });

      return {
        success: true,
        invoiceNumber: invoice.invoiceNumber,
        amountCharged: amount,
        message: 'Payment successful',
      };
    }

    const sanitizedMessage = this.sanitizeGatewayMessage(chargeResult.message);

    await this.prisma.paymentTransaction.create({
      data: {
        type: 'ONE_TIME',
        amount,
        status: 'FAILED',
        responseCode: chargeResult.responseCode ?? null,
        responseMessage: sanitizedMessage,
        saleId: sale.id,
        invoiceId: invoice.id,
      },
    });

    await this.prisma.saleActivity.create({
      data: {
        type: 'PAYMENT_FAILED',
        saleId: sale.id,
        userId: 'system',
        data: {
          amount,
          invoiceId: invoice.id,
          reason: sanitizedMessage,
          source: 'public_payment_link',
        },
      },
    });

    return {
      success: false,
      message: sanitizedMessage ?? 'Payment failed. Please try again.',
      retryable: true,
    };
  }

  private sanitizeGatewayMessage(message?: string): string | undefined {
    if (!message) {
      return undefined;
    }

    return message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]')
      .replace(/\b\d{10,}\b/g, '[ID]')
      .substring(0, 200);
  }
}
