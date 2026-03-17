import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  PrismaService,
  UserRole as PrismaUserRole,
} from '@sentra-core/prisma-client';
import {
  InvoiceStatus,
  SaleActivityType,
  SaleStatus,
  TransactionStatus,
  TransactionType,
} from '@sentra-core/types';
import * as crypto from 'crypto';
import { SalesNotificationService } from '../sales';
import { AuthorizeNetWebhookPayload } from './dto/authorize-net-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly salesNotificationService: SalesNotificationService,
  ) {}

  verifyAuthorizeNetSignature(rawBody: string, signatureHeader: string): boolean {
    const key = this.configService.get<string>('AUTHORIZE_NET_SIGNATURE_KEY');
    if (!key) {
      this.logger.error('AUTHORIZE_NET_SIGNATURE_KEY is not configured');
      return false;
    }

    if (!signatureHeader?.startsWith('sha512=')) {
      return false;
    }

    const providedHex = signatureHeader.replace('sha512=', '').toUpperCase();
    const computedHex = crypto
      .createHmac('sha512', key)
      .update(rawBody, 'utf8')
      .digest('hex')
      .toUpperCase();

    const providedBuffer = Buffer.from(providedHex, 'utf8');
    const computedBuffer = Buffer.from(computedHex, 'utf8');

    if (providedBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, computedBuffer);
  }

  async processEvent(payload: AuthorizeNetWebhookPayload): Promise<void> {
    switch (payload.eventType) {
      case 'net.authorize.payment.authcapture.created':
      case 'net.authorize.payment.capture.created':
        await this.handlePaymentReceived(payload);
        break;
      case 'net.authorize.payment.void.created':
        await this.handlePaymentVoided(payload);
        break;
      case 'net.authorize.payment.refund.created':
        await this.handleRefundCreated(payload);
        break;
      case 'net.authorize.payment.fraud.approved':
        await this.handleFraudApproved(payload);
        break;
      case 'net.authorize.payment.fraud.declined':
        await this.handleFraudDeclined(payload);
        break;
      default:
        this.logger.warn(`Unhandled event: ${payload.eventType}`);
    }
  }

  private async handlePaymentReceived(payload: AuthorizeNetWebhookPayload): Promise<void> {
    const { id: anetTxId, subscriptionId, authAmount } = payload.payload;

    if (!anetTxId) {
      this.logger.warn('Missing transaction id for payment received event');
      return;
    }

    const existing = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId: anetTxId },
    });
    if (existing) {
      this.logger.warn('Duplicate webhook, skipping');
      return;
    }

    const sale = await this.prisma.sale.findFirst({
      where: { subscriptionId, deletedAt: null },
      include: {
        invoices: {
          where: { status: InvoiceStatus.UNPAID },
          orderBy: { dueDate: 'asc' },
        },
      },
    });
    if (!sale) {
      this.logger.warn('No sale found');
      return;
    }

    const oldestInvoice = sale.invoices[0];
    const amount = authAmount ?? 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          transactionId: anetTxId,
          type: TransactionType.ONE_TIME,
          amount,
          status: TransactionStatus.SUCCESS,
          responseCode: payload.payload.responseCode != null ? String(payload.payload.responseCode) : null,
          saleId: sale.id,
          invoiceId: oldestInvoice?.id,
        },
      });

      if (oldestInvoice) {
        await tx.invoice.update({
          where: { id: oldestInvoice.id },
          data: { status: InvoiceStatus.PAID },
        });

        await tx.saleActivity.create({
          data: {
            saleId: sale.id,
            userId: 'system',
            type: SaleActivityType.INVOICE_UPDATED,
            data: {
              invoiceId: oldestInvoice.id,
              status: InvoiceStatus.PAID,
              transactionId: anetTxId,
            } as any,
          },
        });
      }

      if (sale.status === SaleStatus.PENDING) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: SaleStatus.ACTIVE },
        });

        await tx.saleActivity.create({
          data: {
            saleId: sale.id,
            userId: 'system',
            type: SaleActivityType.STATUS_CHANGE,
            data: {
              from: SaleStatus.PENDING,
              to: SaleStatus.ACTIVE,
              trigger: 'subscription_activated',
            } as any,
          },
        });
      }

      await tx.saleActivity.create({
        data: {
          saleId: sale.id,
          userId: 'system',
          type: SaleActivityType.PAYMENT_RECEIVED,
          data: {
            transactionId: anetTxId,
            amount,
            subscriptionId: subscriptionId ?? null,
            invoiceId: oldestInvoice?.id ?? null,
          } as any,
        },
      });
    });
  }

  private async handlePaymentVoided(payload: AuthorizeNetWebhookPayload): Promise<void> {
    const sale = await this.findSaleByContext(payload);
    if (!sale) {
      return;
    }

    const transactionId = payload.payload.id ?? null;

    await this.prisma.paymentTransaction.create({
      data: {
        transactionId,
        type: TransactionType.VOID,
        amount: 0,
        status: TransactionStatus.SUCCESS,
        saleId: sale.id,
      },
    });

    await this.prisma.saleActivity.create({
      data: {
        saleId: sale.id,
        userId: 'system',
        type: SaleActivityType.NOTE,
        data: {
          event: 'payment_voided',
          transactionId,
        } as any,
      },
    });
  }

  private async handleRefundCreated(payload: AuthorizeNetWebhookPayload): Promise<void> {
    const sale = await this.findSaleByContext(payload);
    if (!sale) {
      return;
    }

    const transactionId = payload.payload.id ?? null;
    const amount = payload.payload.authAmount ?? 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          transactionId,
          type: TransactionType.REFUND,
          amount,
          status: TransactionStatus.SUCCESS,
          responseCode: payload.payload.responseCode != null ? String(payload.payload.responseCode) : null,
          saleId: sale.id,
        },
      });

      await tx.saleActivity.create({
        data: {
          saleId: sale.id,
          userId: 'system',
          type: SaleActivityType.REFUND_ISSUED,
          data: {
            amount,
            type: 'gateway_webhook',
            transactionId,
          } as any,
        },
      });
    });
  }

  private async handleFraudApproved(payload: AuthorizeNetWebhookPayload): Promise<void> {
    const sale = await this.findSaleByContext(payload);
    if (!sale) {
      return;
    }

    await this.prisma.saleActivity.create({
      data: {
        saleId: sale.id,
        userId: 'system',
        type: SaleActivityType.NOTE,
        data: {
          event: 'fraud_review_approved',
          transactionId: payload.payload.id ?? null,
        } as any,
      },
    });
  }

  private async handleFraudDeclined(payload: AuthorizeNetWebhookPayload): Promise<void> {
    const sale = await this.findSaleByContext(payload);
    if (!sale) {
      return;
    }

    await this.prisma.saleActivity.create({
      data: {
        saleId: sale.id,
        userId: 'system',
        type: SaleActivityType.PAYMENT_FAILED,
        data: {
          amount: payload.payload.authAmount ?? null,
          reason: 'Fraud review declined',
          transactionId: payload.payload.id ?? null,
        } as any,
      },
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
          message: `Subscription payment failed for sale ${sale.id}.`,
          saleId: sale.id,
          organizationId: sale.organizationId,
          recipientIds: recipients,
        }),
      )
      .catch((err) => this.logger.error('Notification dispatch failed', err));
  }

  private async findSaleByContext(
    payload: AuthorizeNetWebhookPayload,
  ): Promise<(Awaited<ReturnType<PrismaService['sale']['findFirst']>>) | null> {
    const { id: anetTxId, subscriptionId } = payload.payload;

    if (subscriptionId) {
      const sale = await this.prisma.sale.findFirst({
        where: { subscriptionId, deletedAt: null },
        include: {
          invoices: {
            orderBy: { dueDate: 'asc' },
          },
        },
      });

      if (sale) {
        return sale;
      }
    }

    if (!anetTxId) {
      return null;
    }

    const paymentTransaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId: anetTxId },
      include: {
        sale: {
          include: {
            invoices: {
              orderBy: { dueDate: 'asc' },
            },
          },
        },
      },
    });

    if (!paymentTransaction?.sale || paymentTransaction.sale.deletedAt) {
      return null;
    }

    return paymentTransaction.sale;
  }
}
