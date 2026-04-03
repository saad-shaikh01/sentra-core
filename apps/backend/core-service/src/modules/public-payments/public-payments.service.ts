import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { GatewayType } from '@sentra-core/types';
import { StorageService } from '../../common';
import { PaymentGatewayFactory } from '../payment-gateway';
import { CyberSourceService } from '../cybersource/cybersource.service';
import { PublicInvoiceDto } from './dto/public-invoice.dto';
import { PublicPaymentDto } from './dto/public-payment.dto';

@Injectable()
export class PublicPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly storage: StorageService,
    private readonly cyberSourceService: CyberSourceService,
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
              select: {
                name: true,
                logoUrl: true,
                organization: { select: { storageBucket: true, cdnHostname: true } },
              },
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
        logoUrl: this.storage.buildUrl(
          invoice.sale.brand.logoUrl,
          invoice.sale.brand.organization?.storageBucket,
          invoice.sale.brand.organization?.cdnHostname,
        ),
      },
      paymentToken: token,
      gateway: (invoice.sale.gateway ?? 'AUTHORIZE_NET') as 'AUTHORIZE_NET' | 'STRIPE' | 'MANUAL' | 'CYBERSOURCE',
      saleId: invoice.sale.id,
    };
  }

  /**
   * Generate a CyberSource Microform v2 capture context JWT.
   * The frontend passes its page origin so CyberSource can scope the token.
   */
  async getCaptureContext(token: string, pageOrigin: string): Promise<{ captureContext: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentToken: token },
      select: { status: true, id: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already paid');

    const captureContext = await this.cyberSourceService.generateCaptureContext([pageOrigin]);
    return { captureContext };
  }

  /**
   * Create a Stripe PaymentIntent for a public invoice payment.
   * Returns a clientSecret that the frontend uses with Stripe.js to confirm the payment.
   * A PENDING PaymentTransaction is recorded now; the Stripe webhook marks it SUCCESS.
   */
  async createStripePaymentIntent(token: string): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentToken: token },
      include: {
        sale: {
          include: { client: { select: { email: true } } },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already paid');
    }
    if (invoice.status !== 'UNPAID' && invoice.status !== 'OVERDUE') {
      throw new UnprocessableEntityException('Invoice cannot be paid in its current state');
    }

    const sale = invoice.sale;
    const gateway = this.gatewayFactory.resolve(GatewayType.STRIPE);
    const amount = Number(invoice.amount);
    const currency = sale.currency ?? 'USD';

    // Ensure Stripe customer exists
    let gatewayCustomerId = sale.gatewayCustomerId;
    if (!gatewayCustomerId || gatewayCustomerId === 'manual') {
      const customerResult = await gateway.createCustomer({
        email: sale.client.email,
        description: `Public payment for sale ${sale.id}`,
      });
      if (!customerResult.success || !customerResult.gatewayCustomerId) {
        throw new UnprocessableEntityException('Unable to initialize payment. Please try again.');
      }
      gatewayCustomerId = customerResult.gatewayCustomerId;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: { gatewayCustomerId, gateway: 'STRIPE' },
      });
    }

    // Create Stripe PaymentIntent (confirm: false — frontend confirms via Stripe.js)
    const intentResult = await gateway.createPaymentIntent({
      amount,
      currency,
      gatewayCustomerId,
      invoiceNumber: invoice.invoiceNumber,
      metadata: { saleId: sale.id, invoiceId: invoice.id },
    });

    if (!intentResult.success || !intentResult.clientSecret || !intentResult.paymentIntentId) {
      throw new UnprocessableEntityException('Unable to create payment session. Please try again.');
    }

    // Record a PENDING transaction so the Stripe webhook can find and update it
    await this.prisma.paymentTransaction.create({
      data: {
        transactionId: intentResult.paymentIntentId,
        type: 'ONE_TIME',
        amount,
        status: 'PENDING',
        gateway: 'STRIPE',
        saleId: sale.id,
        invoiceId: invoice.id,
      },
    });

    return {
      clientSecret: intentResult.clientSecret,
      paymentIntentId: intentResult.paymentIntentId,
      amount,
      currency,
    };
  }

  /**
   * Process a public invoice payment.
   * - AUTHORIZE_NET: tokenizes card via Accept.js opaqueData, charges directly
   * - STRIPE: should use createStripePaymentIntent instead (this rejects Stripe here)
   * - MANUAL: not supported for public payment links
   */
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
    const gatewayType = (sale.gateway ?? GatewayType.AUTHORIZE_NET) as GatewayType;

    // Stripe and Manual gateways are not handled via this endpoint
    if (gatewayType === GatewayType.STRIPE) {
      throw new BadRequestException(
        'Stripe payments require a payment session. Call POST /public/invoice/:token/create-payment-intent first.',
      );
    }
    if (gatewayType === GatewayType.MANUAL) {
      throw new BadRequestException('Manual payments cannot be processed via public payment links.');
    }

    // Authorize.Net or CyberSource: both use opaqueData.dataValue as the card token
    if (!dto.opaqueData) {
      throw new BadRequestException('opaqueData is required for card payment');
    }

    const isCyberSource = gatewayType === GatewayType.CYBERSOURCE;
    const gateway = this.gatewayFactory.resolve(isCyberSource ? GatewayType.CYBERSOURCE : GatewayType.AUTHORIZE_NET);
    const gatewayLabel = isCyberSource ? 'CYBERSOURCE' : 'AUTHORIZE_NET';
    const amount = Number(invoice.amount);
    const payerEmail = dto.payer?.email ?? sale.client.email ?? 'noreply@placeholder.com';

    let gatewayCustomerId: string = sale.customerProfileId ?? sale.gatewayCustomerId ?? 'cs-direct';
    let gatewayPaymentMethodId: string = sale.paymentProfileId ?? sale.gatewayPaymentMethodId ?? 'cs-direct';

    // CyberSource: charge directly with the transient token — no TMS customer/instrument needed.
    // Authorize.Net: create/reuse customer profile + payment profile as before.
    if (!isCyberSource) {
      if (!gatewayCustomerId || gatewayCustomerId === 'cs-direct') {
        const profileResult = await gateway.createCustomer({
          email: payerEmail,
          description: `Public payment for sale ${sale.id}`,
        });
        if (!profileResult.success || !profileResult.gatewayCustomerId) {
          return { success: false, message: 'Unable to process payment. Please try again.', retryable: true };
        }
        gatewayCustomerId = profileResult.gatewayCustomerId;
        await this.prisma.sale.update({
          where: { id: sale.id },
          data: { customerProfileId: gatewayCustomerId, gatewayCustomerId },
        });
      }

      if (!gatewayPaymentMethodId || gatewayPaymentMethodId === 'cs-direct') {
        const pmResult = await gateway.createPaymentMethod({
          gatewayCustomerId,
          opaqueData: dto.opaqueData,
        });
        if (!pmResult.success || !pmResult.gatewayPaymentMethodId) {
          return { success: false, message: 'Unable to process payment. Please check your card details.', retryable: true };
        }
        gatewayPaymentMethodId = pmResult.gatewayPaymentMethodId;
        await this.prisma.sale.update({
          where: { id: sale.id },
          data: { paymentProfileId: gatewayPaymentMethodId, gatewayPaymentMethodId },
        });
      }
    }

    const chargeResult = await gateway.chargeOnce({
      gatewayCustomerId,
      gatewayPaymentMethodId,
      amount,
      invoiceNumber: invoice.invoiceNumber,
      // CyberSource: pass transient token so gateway uses direct charge path
      opaqueData: isCyberSource ? dto.opaqueData : undefined,
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
            gateway: gatewayLabel,
            transactionId: chargeResult.gatewayTransactionId ?? null,
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
              gateway: gatewayLabel,
              transactionId: chargeResult.gatewayTransactionId,
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
        gateway: gatewayLabel,
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
