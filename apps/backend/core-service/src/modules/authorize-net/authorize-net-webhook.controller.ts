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
import * as crypto from 'crypto';
import { WebhookPayload } from './authorize-net.types';

@SkipThrottle()
@Controller('webhooks')
export class AuthorizeNetWebhookController {
  private readonly logger = new Logger(AuthorizeNetWebhookController.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('authorize-net')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-anet-signature') signature: string,
  ) {
    // 1. Verify HMAC-SHA512 signature
    const webhookSecret = this.config.getOrThrow<string>(
      'AUTHORIZE_NET_WEBHOOK_SIGNATURE',
    );

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expectedHash = crypto
      .createHmac('sha512', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const receivedHash = signature.replace('sha512=', '').toUpperCase();
    const computedHash = expectedHash.toUpperCase();

    if (receivedHash !== computedHash) {
      this.logger.warn('Authorize.net webhook signature verification failed');
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Parse event type from body
    const body = req.body as WebhookPayload;
    const { eventType, payload } = body;

    this.logger.log(
      `Received Authorize.net webhook: ${eventType} (notification: ${body.notificationId})`,
    );

    // 3. Handle events
    switch (eventType) {
      case 'net.authorize.payment.authcapture.created':
        await this.handlePaymentCaptured(payload);
        break;

      case 'net.authorize.payment.fraud.declined':
        await this.handlePaymentDeclined(payload);
        break;

      case 'net.authorize.payment.refund.created':
        await this.handleRefundCreated(payload);
        break;

      default:
        this.logger.debug(`Unhandled Authorize.net event type: ${eventType}`);
    }

    // 4. Return acknowledgement
    return { received: true };
  }

  private async handlePaymentCaptured(payload: WebhookPayload['payload']) {
    const transactionId = payload.id;
    if (!transactionId) return;

    this.logger.log(`Payment captured: transaction ${transactionId}`);

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId },
    });

    if (!transaction) {
      this.logger.warn(
        `No matching PaymentTransaction found for transactionId: ${transactionId}`,
      );
      return;
    }

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        responseCode: String(payload.responseCode ?? ''),
      },
    });

    this.logger.log(
      `Updated PaymentTransaction ${transaction.id} status to SUCCESS`,
    );
  }

  private async handlePaymentDeclined(payload: WebhookPayload['payload']) {
    const transactionId = payload.id;
    if (!transactionId) return;

    this.logger.log(`Payment declined (fraud): transaction ${transactionId}`);

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId },
    });

    if (!transaction) {
      this.logger.warn(
        `No matching PaymentTransaction found for transactionId: ${transactionId}`,
      );
      return;
    }

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
        responseCode: String(payload.responseCode ?? ''),
        responseMessage: 'Declined due to fraud detection',
      },
    });

    this.logger.log(
      `Updated PaymentTransaction ${transaction.id} status to FAILED`,
    );
  }

  private async handleRefundCreated(payload: WebhookPayload['payload']) {
    const transactionId = payload.id;
    if (!transactionId) return;

    this.logger.log(`Refund created: transaction ${transactionId}`);

    // Find the original transaction to get saleId and invoiceId
    const originalTransaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId },
    });

    if (!originalTransaction) {
      this.logger.warn(
        `No matching original PaymentTransaction found for refund transactionId: ${transactionId}`,
      );
      return;
    }

    await this.prisma.paymentTransaction.create({
      data: {
        transactionId: `refund_${transactionId}`,
        type: 'REFUND',
        amount: payload.authAmount ?? originalTransaction.amount,
        status: 'SUCCESS',
        responseCode: String(payload.responseCode ?? ''),
        saleId: originalTransaction.saleId,
        invoiceId: originalTransaction.invoiceId,
      },
    });

    // Update original transaction status to REFUNDED
    await this.prisma.paymentTransaction.update({
      where: { id: originalTransaction.id },
      data: { status: 'REFUNDED' },
    });

    this.logger.log(
      `Created REFUND transaction and updated original ${originalTransaction.id} to REFUNDED`,
    );
  }
}
