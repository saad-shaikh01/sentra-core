import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators';
import { PrismaService } from '@sentra-core/prisma-client';
import { Request } from 'express';
import Stripe from 'stripe';

@SkipThrottle()
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not configured — Stripe webhook handler is disabled');
    }
  }

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!this.stripe) {
      this.logger.warn('Stripe webhook received but STRIPE_SECRET_KEY is not configured — ignoring');
      return { received: true };
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not configured — skipping signature verification');
      return { received: true };
    }

    let event: Stripe.Event;
    try {
      // IMPORTANT: req.body must be raw Buffer for Stripe signature verification.
      // main.ts must expose rawBody on the request object for /webhooks/stripe.
      // If rawBody is not set up in main.ts, signature verification will fail.
      // To enable: in main.ts, use bodyParser with verify callback to set req.rawBody,
      // or use NestJS rawBody option: NestFactory.create(AppModule, { rawBody: true }).
      const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook verification failed: ${err.message}`);
    }

    this.logger.log(`Received Stripe webhook: ${event.type} (id: ${event.id})`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = paymentIntent.id;
    this.logger.log(`Payment intent succeeded: ${paymentIntentId}`);

    // Find the pending transaction by gateway transaction ID
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId: paymentIntentId, gateway: 'STRIPE' },
    });

    if (!transaction) {
      this.logger.warn(`No pending PaymentTransaction found for Stripe payment_intent: ${paymentIntentId}`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: 'SUCCESS', responseCode: 'succeeded' },
      });

      // Mark invoice as PAID if linked
      if (transaction.invoiceId) {
        await tx.invoice.update({
          where: { id: transaction.invoiceId },
          data: { status: 'PAID' },
        });
      }

      // Activate sale if it was PENDING
      const sale = await tx.sale.findUnique({ where: { id: transaction.saleId } });
      if (sale?.status === 'PENDING') {
        await tx.sale.update({
          where: { id: transaction.saleId },
          data: { status: 'ACTIVE' },
        });
        await tx.saleActivity.create({
          data: {
            type: 'STATUS_CHANGE',
            saleId: transaction.saleId,
            userId: 'system',
            data: { from: 'PENDING', to: 'ACTIVE', trigger: 'stripe_payment_confirmed' },
          },
        });
      }

      await tx.saleActivity.create({
        data: {
          type: 'PAYMENT_RECEIVED',
          saleId: transaction.saleId,
          userId: 'system',
          data: {
            amount: Number(transaction.amount),
            invoiceId: transaction.invoiceId ?? null,
            source: 'stripe_webhook',
            paymentIntentId,
          },
        },
      });
    });

    this.logger.log(`Updated transaction ${transaction.id} to SUCCESS via Stripe webhook`);
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = paymentIntent.id;
    this.logger.log(`Payment intent failed: ${paymentIntentId}`);

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId: paymentIntentId, gateway: 'STRIPE' },
    });

    if (!transaction) {
      this.logger.warn(`No PaymentTransaction found for failed Stripe payment_intent: ${paymentIntentId}`);
      return;
    }

    const failureMessage = paymentIntent.last_payment_error?.message ?? 'Payment failed';

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
        responseCode: paymentIntent.last_payment_error?.code ?? 'failed',
        responseMessage: failureMessage,
      },
    });

    await this.prisma.saleActivity.create({
      data: {
        type: 'PAYMENT_FAILED',
        saleId: transaction.saleId,
        userId: 'system',
        data: {
          amount: Number(transaction.amount),
          reason: failureMessage,
          source: 'stripe_webhook',
          paymentIntentId,
        },
      },
    });

    this.logger.log(`Updated transaction ${transaction.id} to FAILED via Stripe webhook`);
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

    if (!paymentIntentId) return;

    this.logger.log(`Charge refunded for payment_intent: ${paymentIntentId}`);

    const originalTransaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId: paymentIntentId, gateway: 'STRIPE' },
    });

    if (!originalTransaction) {
      this.logger.warn(`No PaymentTransaction found for refunded charge with payment_intent: ${paymentIntentId}`);
      return;
    }

    const refundAmount = charge.amount_refunded / 100; // Stripe amounts are in cents

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: {
          transactionId: `refund_${paymentIntentId}`,
          type: 'REFUND',
          amount: refundAmount,
          status: 'SUCCESS',
          gateway: 'STRIPE',
          responseCode: 'refunded',
          saleId: originalTransaction.saleId,
          invoiceId: originalTransaction.invoiceId,
        },
      });

      await tx.paymentTransaction.update({
        where: { id: originalTransaction.id },
        data: { status: 'REFUNDED' },
      });
    });

    this.logger.log(`Created REFUND transaction for Stripe payment_intent: ${paymentIntentId}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const subscriptionId = subscription.id;
    this.logger.log(`Stripe subscription deleted: ${subscriptionId}`);

    // Find the sale linked to this gateway subscription ID
    const sale = await this.prisma.sale.findFirst({
      where: { gatewaySubscriptionId: subscriptionId },
    });

    if (!sale) {
      this.logger.warn(`No sale found for cancelled Stripe subscription: ${subscriptionId}`);
      return;
    }

    await this.prisma.sale.update({
      where: { id: sale.id },
      data: { gatewaySubscriptionId: null },
    });

    await this.prisma.saleActivity.create({
      data: {
        type: 'STATUS_CHANGE',
        saleId: sale.id,
        userId: 'system',
        data: { trigger: 'stripe_subscription_deleted', subscriptionId },
      },
    });

    this.logger.log(`Cleared gatewaySubscriptionId for sale ${sale.id}`);
  }
}
