import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateCustomerProfileParams,
  CreatePaymentProfileParams,
  ChargeCustomerProfileParams,
  CreateSubscriptionParams,
  AuthorizeNetResponse,
} from './authorize-net.types';

@Injectable()
export class AuthorizeNetService {
  private readonly logger = new Logger(AuthorizeNetService.name);

  constructor(private config: ConfigService) {}

  private getApiUrl(): string {
    const environment = this.config.get<string>('AUTHORIZE_NET_ENVIRONMENT', 'sandbox');
    return environment === 'production'
      ? 'https://api.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';
  }

  private getMerchantAuth(): { name: string; transactionKey: string } {
    return {
      name: this.config.getOrThrow<string>('AUTHORIZE_NET_API_LOGIN_ID'),
      transactionKey: this.config.getOrThrow<string>('AUTHORIZE_NET_TRANSACTION_KEY'),
    };
  }

  private async makeRequest(payload: Record<string, unknown>): Promise<any> {
    const url = this.getApiUrl();
    this.logger.debug(`Authorize.net API request to ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    // Authorize.net returns a BOM character at the start of JSON responses
    const cleanText = text.replace(/^\uFEFF/, '');
    const data = JSON.parse(cleanText);

    if (data.messages?.resultCode === 'Error') {
      const errorMessage = data.messages?.message?.[0]?.text ?? 'Unknown Authorize.net error';
      this.logger.error(`Authorize.net API error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return data;
  }

  async createCustomerProfile(
    params: CreateCustomerProfileParams,
  ): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        createCustomerProfileRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          profile: {
            email: params.email,
            description: params.description ?? '',
          },
          validationMode: 'none',
        },
      });

      return {
        success: true,
        customerProfileId: response.customerProfileId,
        message: response.messages?.message?.[0]?.text,
      };
    } catch (error) {
      this.logger.error(`Failed to create customer profile: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async createPaymentProfile(
    params: CreatePaymentProfileParams,
  ): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        createCustomerPaymentProfileRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          customerProfileId: params.customerProfileId,
          paymentProfile: {
            payment: {
              opaqueData: {
                dataDescriptor: params.opaqueData.dataDescriptor,
                dataValue: params.opaqueData.dataValue,
              },
            },
          },
          validationMode: 'none',
        },
      });

      return {
        success: true,
        paymentProfileId: response.customerPaymentProfileId,
        message: response.messages?.message?.[0]?.text,
      };
    } catch (error) {
      this.logger.error(`Failed to create payment profile: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async chargeCustomerProfile(
    params: ChargeCustomerProfileParams,
  ): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        createTransactionRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          transactionRequest: {
            transactionType: 'authCaptureTransaction',
            amount: params.amount,
            profile: {
              customerProfileId: params.customerProfileId,
              paymentProfile: {
                paymentProfileId: params.paymentProfileId,
              },
            },
            ...(params.invoiceNumber && {
              order: { invoiceNumber: params.invoiceNumber },
            }),
          },
        },
      });

      const transResult = response.transactionResponse;

      return {
        success: true,
        transactionId: transResult?.transId,
        responseCode: transResult?.responseCode,
        message: transResult?.messages?.[0]?.description ?? response.messages?.message?.[0]?.text,
      };
    } catch (error) {
      this.logger.error(`Failed to charge customer profile: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        ARBCreateSubscriptionRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          subscription: {
            name: params.name,
            paymentSchedule: {
              interval: {
                length: params.intervalLength,
                unit: params.intervalUnit,
              },
              startDate: params.startDate,
              totalOccurrences: params.totalOccurrences,
            },
            amount: params.amount,
            profile: {
              customerProfileId: params.customerProfileId,
              customerPaymentProfileId: params.paymentProfileId,
            },
          },
        },
      });

      return {
        success: true,
        subscriptionId: response.subscriptionId,
        message: response.messages?.message?.[0]?.text,
      };
    } catch (error) {
      this.logger.error(`Failed to create subscription: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        ARBCancelSubscriptionRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          subscriptionId,
        },
      });

      return {
        success: true,
        subscriptionId,
        message: response.messages?.message?.[0]?.text,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<AuthorizeNetResponse> {
    try {
      const response = await this.makeRequest({
        ARBGetSubscriptionStatusRequest: {
          merchantAuthentication: this.getMerchantAuth(),
          subscriptionId,
        },
      });

      return {
        success: true,
        subscriptionId,
        message: response.status,
      };
    } catch (error) {
      this.logger.error(`Failed to get subscription status: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}
