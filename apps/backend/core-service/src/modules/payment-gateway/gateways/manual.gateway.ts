import { Logger } from '@nestjs/common';
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

/**
 * ManualGateway — for external payment systems (e.g. Billergenie).
 * Does not call any external API. Records are created in the DB directly.
 * Staff manually confirms payment receipt and records it via the record-payment endpoint.
 */
export class ManualGateway implements IPaymentGateway {
  private readonly logger = new Logger(ManualGateway.name);

  async createCustomer(_params: IGatewayCustomerParams): Promise<IGatewayResponse> {
    return { success: true, gatewayCustomerId: 'manual', message: 'Manual gateway: no customer profile needed' };
  }

  async createPaymentMethod(_params: IGatewayPaymentMethodParams): Promise<IGatewayResponse> {
    return { success: true, gatewayPaymentMethodId: 'manual', message: 'Manual gateway: no payment method needed' };
  }

  async chargeOnce(_params: IGatewayChargeParams): Promise<IGatewayResponse> {
    // Manual payments are recorded externally; this should not be called
    this.logger.warn('ManualGateway.chargeOnce called — manual payments must use the record-payment endpoint');
    return {
      success: false,
      message: 'Manual payments cannot be charged automatically. Use the record-payment endpoint to record external payment.',
    };
  }

  async createPaymentIntent(_params: IGatewayPaymentIntentParams): Promise<IGatewayResponse> {
    return {
      success: false,
      message: 'Manual gateway does not support PaymentIntents. Redirect the client to your external payment system.',
    };
  }

  async createSubscription(_params: IGatewaySubscriptionParams): Promise<IGatewayResponse> {
    return {
      success: false,
      message: 'Manual gateway does not support automated subscriptions.',
    };
  }

  async cancelSubscription(_subscriptionId: string): Promise<IGatewayResponse> {
    return { success: true, message: 'Manual subscription noted as cancelled' };
  }

  async refund(_params: IGatewayRefundParams): Promise<IGatewayResponse> {
    return { success: true, message: 'Manual refund recorded — process refund through your external payment system' };
  }
}
