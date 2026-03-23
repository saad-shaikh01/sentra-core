import { Logger } from '@nestjs/common';
import { AuthorizeNetService } from '../../authorize-net/authorize-net.service';
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

export class AuthorizeNetGateway implements IPaymentGateway {
  private readonly logger = new Logger(AuthorizeNetGateway.name);

  constructor(private readonly authorizeNetService: AuthorizeNetService) {}

  async createCustomer(params: IGatewayCustomerParams): Promise<IGatewayResponse> {
    const result = await this.authorizeNetService.createCustomerProfile({
      email: params.email,
      description: params.description,
    });
    return {
      success: result.success,
      gatewayCustomerId: result.customerProfileId,
      message: result.message,
    };
  }

  async createPaymentMethod(params: IGatewayPaymentMethodParams): Promise<IGatewayResponse> {
    if (!params.opaqueData) {
      return { success: false, message: 'opaqueData is required for Authorize.Net payment method creation' };
    }
    const result = await this.authorizeNetService.createPaymentProfile({
      customerProfileId: params.gatewayCustomerId,
      opaqueData: params.opaqueData,
    });
    return {
      success: result.success,
      gatewayPaymentMethodId: result.paymentProfileId,
      message: result.message,
    };
  }

  async chargeOnce(params: IGatewayChargeParams): Promise<IGatewayResponse> {
    const result = await this.authorizeNetService.chargeCustomerProfile({
      customerProfileId: params.gatewayCustomerId,
      paymentProfileId: params.gatewayPaymentMethodId,
      amount: params.amount,
      invoiceNumber: params.invoiceNumber,
    });
    return {
      success: result.success,
      gatewayTransactionId: result.transactionId,
      responseCode: result.responseCode,
      message: result.message,
    };
  }

  async createPaymentIntent(_params: IGatewayPaymentIntentParams): Promise<IGatewayResponse> {
    // Authorize.Net does not use PaymentIntents; return unsupported
    return {
      success: false,
      message: 'PaymentIntent flow is not supported for Authorize.Net. Use chargeOnce instead.',
    };
  }

  async createSubscription(params: IGatewaySubscriptionParams): Promise<IGatewayResponse> {
    const result = await this.authorizeNetService.createSubscription({
      name: params.name,
      intervalLength: params.intervalLength,
      intervalUnit: params.intervalUnit,
      startDate: params.startDate,
      totalOccurrences: params.totalOccurrences,
      amount: params.amount,
      customerProfileId: params.gatewayCustomerId,
      paymentProfileId: params.gatewayPaymentMethodId,
    });
    return {
      success: result.success,
      gatewaySubscriptionId: result.subscriptionId,
      message: result.message,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<IGatewayResponse> {
    const result = await this.authorizeNetService.cancelSubscription(subscriptionId);
    return {
      success: result.success,
      message: result.message,
    };
  }

  async refund(params: IGatewayRefundParams): Promise<IGatewayResponse> {
    try {
      const result = await this.authorizeNetService.refundTransaction({
        transactionId: params.transactionId,
        amount: params.amount,
        cardLastFour: params.cardLastFour,
      });
      return {
        success: result.success,
        gatewayTransactionId: result.transactionId,
        responseCode: result.responseCode,
        message: result.message,
      };
    } catch (err) {
      this.logger.warn(`Authorize.Net refund not implemented: ${err.message}`);
      return { success: false, message: err.message };
    }
  }
}
