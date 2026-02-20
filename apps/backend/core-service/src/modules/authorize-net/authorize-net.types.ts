export interface CreateCustomerProfileParams {
  email: string;
  description?: string;
}

export interface CreatePaymentProfileParams {
  customerProfileId: string;
  opaqueData: {
    dataDescriptor: string;
    dataValue: string;
  };
}

export interface ChargeCustomerProfileParams {
  customerProfileId: string;
  paymentProfileId: string;
  amount: number;
  invoiceNumber?: string;
}

export interface CreateSubscriptionParams {
  name: string;
  intervalLength: number;
  intervalUnit: 'days' | 'months';
  startDate: string;
  totalOccurrences: number;
  amount: number;
  customerProfileId: string;
  paymentProfileId: string;
}

export interface AuthorizeNetResponse {
  success: boolean;
  transactionId?: string;
  customerProfileId?: string;
  paymentProfileId?: string;
  subscriptionId?: string;
  responseCode?: string;
  message?: string;
}

export interface WebhookPayload {
  notificationId: string;
  eventType: string;
  eventDate: string;
  webhookId: string;
  payload: {
    id?: string;
    entityName?: string;
    responseCode?: number;
    authAmount?: number;
    [key: string]: unknown;
  };
}
