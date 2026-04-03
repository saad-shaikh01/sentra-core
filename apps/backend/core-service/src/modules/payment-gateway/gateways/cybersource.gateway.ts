import { Logger } from '@nestjs/common';
import { CyberSourceService } from '../../cybersource/cybersource.service';
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

export class CyberSourceGateway implements IPaymentGateway {
  private readonly logger = new Logger(CyberSourceGateway.name);

  constructor(private readonly cyberSource: CyberSourceService) {}

  async createCustomer(params: IGatewayCustomerParams): Promise<IGatewayResponse> {
    const result = await this.cyberSource.createCustomer(params.email, params.description);
    return {
      success: result.success,
      gatewayCustomerId: result.customerId,
      message: result.message,
    };
  }

  async createPaymentMethod(params: IGatewayPaymentMethodParams): Promise<IGatewayResponse> {
    // CyberSource uses transient token JWT from Microform (frontend tokenization).
    // Pass it in opaqueData.dataValue (same field Authorize.Net uses for Accept.js token).
    if (!params.opaqueData?.dataValue) {
      return { success: false, message: 'CyberSource requires a transient token JWT (opaqueData.dataValue)' };
    }
    const result = await this.cyberSource.createPaymentInstrument(
      params.gatewayCustomerId,
      params.opaqueData.dataValue,
    );
    return {
      success: result.success,
      gatewayPaymentMethodId: result.instrumentId,
      message: result.message,
    };
  }

  async chargeOnce(params: IGatewayChargeParams): Promise<IGatewayResponse> {
    // Prefer direct transient-token charge (Microform v2) — no TMS roundtrip needed.
    if (params.opaqueData?.dataValue) {
      const result = await this.cyberSource.chargeWithTransientToken({
        transientTokenJwt: params.opaqueData.dataValue,
        amount: params.amount,
        currency: params.currency ?? 'USD',
        invoiceNumber: params.invoiceNumber,
        idempotencyKey: params.idempotencyKey,
      });
      return {
        success: result.success,
        gatewayTransactionId: result.transactionId,
        responseCode: result.responseCode,
        message: result.message,
      };
    }

    // Fallback: stored TMS customer + instrument (for future saved-card support)
    const result = await this.cyberSource.chargeCustomer({
      customerId: params.gatewayCustomerId,
      instrumentId: params.gatewayPaymentMethodId,
      amountCents: Math.round(params.amount * 100),
      currency: params.currency ?? 'USD',
      invoiceNumber: params.invoiceNumber,
      idempotencyKey: params.idempotencyKey,
    });
    return {
      success: result.success,
      gatewayTransactionId: result.transactionId,
      responseCode: result.responseCode,
      message: result.message,
    };
  }

  async createPaymentIntent(_params: IGatewayPaymentIntentParams): Promise<IGatewayResponse> {
    // CyberSource does not use PaymentIntents — use chargeOnce with stored token
    return {
      success: false,
      message: 'PaymentIntent flow is not supported for CyberSource. Use chargeOnce with a stored payment instrument.',
    };
  }

  async createSubscription(_params: IGatewaySubscriptionParams): Promise<IGatewayResponse> {
    // CyberSource recurring billing can be added later via /pts/v2/recurring-payments
    return {
      success: false,
      message: 'Recurring billing via CyberSource is not yet implemented.',
    };
  }

  async cancelSubscription(_subscriptionId: string): Promise<IGatewayResponse> {
    return { success: false, message: 'CyberSource subscriptions not yet implemented.' };
  }

  async refund(params: IGatewayRefundParams): Promise<IGatewayResponse> {
    const result = await this.cyberSource.refundPayment({
      transactionId: params.transactionId,
      amountCents: Math.round(params.amount * 100),
      currency: 'USD',
    });
    return {
      success: result.success,
      gatewayTransactionId: result.transactionId,
      message: result.message,
    };
  }
}
