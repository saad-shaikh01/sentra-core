export interface IGatewayCustomerParams {
  email: string;
  description?: string;
}

export interface IGatewayPaymentMethodParams {
  gatewayCustomerId: string;
  // Authorize.Net opaque data (Accept.js tokenized card)
  opaqueData?: { dataDescriptor: string; dataValue: string };
  // Stripe Payment Method ID (from Stripe.js)
  stripePaymentMethodId?: string;
}

export interface IGatewayChargeParams {
  gatewayCustomerId: string;
  gatewayPaymentMethodId: string;
  amount: number;
  currency?: string;
  invoiceNumber?: string;
  idempotencyKey?: string;
}

export interface IGatewayPaymentIntentParams {
  amount: number;
  currency?: string;
  gatewayCustomerId?: string;
  invoiceNumber?: string;
  metadata?: Record<string, string>;
}

export interface IGatewaySubscriptionParams {
  name: string;
  intervalLength: number;
  intervalUnit: 'days' | 'months';
  startDate: string;
  totalOccurrences: number;
  amount: number;
  currency?: string;
  gatewayCustomerId: string;
  gatewayPaymentMethodId: string;
}

export interface IGatewayRefundParams {
  transactionId: string;
  amount: number;
  cardLastFour?: string;
}

export interface IGatewayResponse {
  success: boolean;
  gatewayTransactionId?: string;
  gatewayCustomerId?: string;
  gatewayPaymentMethodId?: string;
  gatewaySubscriptionId?: string;
  responseCode?: string;
  message?: string;
  // Stripe-specific: returned from createPaymentIntent
  clientSecret?: string;
  paymentIntentId?: string;
}

export interface IPaymentGateway {
  createCustomer(params: IGatewayCustomerParams): Promise<IGatewayResponse>;
  createPaymentMethod(params: IGatewayPaymentMethodParams): Promise<IGatewayResponse>;
  chargeOnce(params: IGatewayChargeParams): Promise<IGatewayResponse>;
  createPaymentIntent(params: IGatewayPaymentIntentParams): Promise<IGatewayResponse>;
  createSubscription(params: IGatewaySubscriptionParams): Promise<IGatewayResponse>;
  cancelSubscription(subscriptionId: string): Promise<IGatewayResponse>;
  refund(params: IGatewayRefundParams): Promise<IGatewayResponse>;
}
