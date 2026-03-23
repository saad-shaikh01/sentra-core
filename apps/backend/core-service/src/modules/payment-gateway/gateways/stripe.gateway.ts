import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  IPaymentGateway,
  IGatewayCustomerParams,
  IGatewayPaymentMethodParams,
  IGatewayChargeParams,
  IGatewayPaymentIntentParams,
  IGatewaySubscriptionParams,
  IGatewayRefundParams,
  IGatewayResponse,
} from '../interfaces/payment-gateway.interface';

export class StripeGateway implements IPaymentGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured. Cannot use Stripe gateway.');
    }
    this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  }

  async createCustomer(params: IGatewayCustomerParams): Promise<IGatewayResponse> {
    try {
      const customer = await this.stripe.customers.create({
        email: params.email,
        description: params.description,
      });
      return { success: true, gatewayCustomerId: customer.id };
    } catch (err) {
      this.logger.error(`Stripe createCustomer failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async createPaymentMethod(params: IGatewayPaymentMethodParams): Promise<IGatewayResponse> {
    try {
      if (!params.stripePaymentMethodId) {
        return { success: false, message: 'stripePaymentMethodId is required for Stripe payment method setup' };
      }
      // Attach the payment method to the customer
      await this.stripe.paymentMethods.attach(params.stripePaymentMethodId, {
        customer: params.gatewayCustomerId,
      });
      // Set as default payment method for the customer
      await this.stripe.customers.update(params.gatewayCustomerId, {
        invoice_settings: { default_payment_method: params.stripePaymentMethodId },
      });
      return { success: true, gatewayPaymentMethodId: params.stripePaymentMethodId };
    } catch (err) {
      this.logger.error(`Stripe createPaymentMethod failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async chargeOnce(params: IGatewayChargeParams): Promise<IGatewayResponse> {
    try {
      const amountInCents = Math.round(params.amount * 100);
      const currency = (params.currency ?? 'usd').toLowerCase();
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency,
          customer: params.gatewayCustomerId,
          payment_method: params.gatewayPaymentMethodId,
          confirm: true,
          off_session: true,
          ...(params.invoiceNumber && {
            metadata: { invoiceNumber: params.invoiceNumber },
          }),
        },
        params.idempotencyKey
          ? { idempotencyKey: params.idempotencyKey }
          : undefined,
      );
      return {
        success: intent.status === 'succeeded',
        gatewayTransactionId: intent.id,
        responseCode: intent.status,
        message: intent.status,
      };
    } catch (err) {
      this.logger.error(`Stripe chargeOnce failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async createPaymentIntent(params: IGatewayPaymentIntentParams): Promise<IGatewayResponse> {
    try {
      const amountInCents = Math.round(params.amount * 100);
      const currency = (params.currency ?? 'usd').toLowerCase();
      const intent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        ...(params.gatewayCustomerId && { customer: params.gatewayCustomerId }),
        ...(params.invoiceNumber && {
          metadata: { invoiceNumber: params.invoiceNumber, ...(params.metadata ?? {}) },
        }),
        automatic_payment_methods: { enabled: true },
      });
      return {
        success: true,
        gatewayTransactionId: intent.id,
        clientSecret: intent.client_secret ?? undefined,
        paymentIntentId: intent.id,
      };
    } catch (err) {
      this.logger.error(`Stripe createPaymentIntent failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async createSubscription(params: IGatewaySubscriptionParams): Promise<IGatewayResponse> {
    try {
      const currency = (params.currency ?? 'usd').toLowerCase();
      // Create a recurring price on the fly
      const price = await this.stripe.prices.create({
        unit_amount: Math.round(params.amount * 100),
        currency,
        recurring: {
          interval: params.intervalUnit === 'months' ? 'month' : 'day',
          interval_count: params.intervalLength,
        },
        product_data: { name: params.name },
      });

      const subscriptionStartDate = new Date(params.startDate);
      const billingCycleAnchor = Math.floor(subscriptionStartDate.getTime() / 1000);

      const subscription = await this.stripe.subscriptions.create({
        customer: params.gatewayCustomerId,
        items: [{ price: price.id }],
        default_payment_method: params.gatewayPaymentMethodId,
        billing_cycle_anchor: billingCycleAnchor,
        proration_behavior: 'none',
        cancel_at: params.totalOccurrences > 0
          ? this.calculateSubscriptionEndDate(
              subscriptionStartDate,
              params.intervalLength,
              params.intervalUnit,
              params.totalOccurrences,
            )
          : undefined,
      });

      return {
        success: true,
        gatewaySubscriptionId: subscription.id,
        message: subscription.status,
      };
    } catch (err) {
      this.logger.error(`Stripe createSubscription failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<IGatewayResponse> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
      return { success: true };
    } catch (err) {
      this.logger.error(`Stripe cancelSubscription failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async refund(params: IGatewayRefundParams): Promise<IGatewayResponse> {
    try {
      const amountInCents = Math.round(params.amount * 100);
      const refund = await this.stripe.refunds.create({
        payment_intent: params.transactionId,
        amount: amountInCents,
      });
      return {
        success: refund.status === 'succeeded' || refund.status === 'pending',
        gatewayTransactionId: refund.id,
        responseCode: refund.status,
        message: refund.status,
      };
    } catch (err) {
      this.logger.error(`Stripe refund failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  private calculateSubscriptionEndDate(
    startDate: Date,
    intervalLength: number,
    intervalUnit: 'days' | 'months',
    totalOccurrences: number,
  ): number {
    const end = new Date(startDate);
    if (intervalUnit === 'months') {
      end.setMonth(end.getMonth() + intervalLength * totalOccurrences);
    } else {
      end.setDate(end.getDate() + intervalLength * totalOccurrences);
    }
    return Math.floor(end.getTime() / 1000);
  }
}
