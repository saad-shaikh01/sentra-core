import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

export interface CyberSourceCustomerResult {
  success: boolean;
  customerId?: string;
  message?: string;
}

export interface CyberSourcePaymentMethodResult {
  success: boolean;
  instrumentId?: string;
  message?: string;
}

export interface CyberSourceChargeResult {
  success: boolean;
  transactionId?: string;
  responseCode?: string;
  message?: string;
}

export interface CyberSourceRefundResult {
  success: boolean;
  transactionId?: string;
  message?: string;
}

@Injectable()
export class CyberSourceService {
  private readonly logger = new Logger(CyberSourceService.name);
  private readonly merchantId: string;
  private readonly apiKeyId: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.merchantId = this.config.get<string>('CYBERSOURCE_MERCHANT_ID', '');
    this.apiKeyId   = this.config.get<string>('CYBERSOURCE_API_KEY_ID', '');
    this.secretKey  = this.config.get<string>('CYBERSOURCE_SECRET_KEY', '');
    const env       = this.config.get<string>('CYBERSOURCE_ENV', 'sandbox');
    this.baseUrl    = env === 'production'
      ? 'https://api.cybersource.com'
      : 'https://apitest.cybersource.com';

    this.http = axios.create({ baseURL: this.baseUrl, timeout: 30_000 });
  }

  // ─── HMAC-SHA256 HTTP Signature Auth ──────────────────────────────────────

  private buildAuthHeaders(
    method: string,
    path: string,
    body: string | null,
    requestId: string,
  ): Record<string, string> {
    const host = this.baseUrl.replace('https://', '');
    const date = new Date().toUTCString();
    const digest = body
      ? `SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}`
      : undefined;

    const headersToSign = ['host', 'date', 'request-target'];
    if (digest) headersToSign.push('digest');
    headersToSign.push('v-c-merchant-id');

    const requestTarget = `${method.toLowerCase()} ${path}`;

    const signingParts: string[] = [
      `host: ${host}`,
      `date: ${date}`,
      `request-target: ${requestTarget}`,
    ];
    if (digest) signingParts.push(`digest: ${digest}`);
    signingParts.push(`v-c-merchant-id: ${this.merchantId}`);

    const signingString = signingParts.join('\n');
    const signature = crypto
      .createHmac('sha256', Buffer.from(this.secretKey, 'base64'))
      .update(signingString)
      .digest('base64');

    const signatureHeader = [
      `keyid="${this.apiKeyId}"`,
      `algorithm="HmacSHA256"`,
      `headers="${headersToSign.join(' ')}"`,
      `signature="${signature}"`,
    ].join(', ');

    const headers: Record<string, string> = {
      'Host': host,
      'Date': date,
      'Signature': signatureHeader,
      'v-c-merchant-id': this.merchantId,
      'v-c-request-id': requestId,
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json;charset=utf-8',
    };

    if (digest) headers['Digest'] = digest;
    return headers;
  }

  private requestId(): string {
    return crypto.randomUUID();
  }

  private async post<T>(path: string, body: object): Promise<T> {
    const reqId = this.requestId();
    const bodyStr = JSON.stringify(body);
    const headers = this.buildAuthHeaders('POST', path, bodyStr, reqId);
    const res = await this.http.post<T>(path, bodyStr, { headers });
    return res.data;
  }

  private async get<T>(path: string): Promise<T> {
    const reqId = this.requestId();
    const headers = this.buildAuthHeaders('GET', path, null, reqId);
    const res = await this.http.get<T>(path, { headers });
    return res.data;
  }

  private async patch<T>(path: string, body: object): Promise<T> {
    const reqId = this.requestId();
    const bodyStr = JSON.stringify(body);
    const headers = this.buildAuthHeaders('PATCH', path, bodyStr, reqId);
    const res = await this.http.patch<T>(path, bodyStr, { headers });
    return res.data;
  }

  // ─── Customer (TMS) ───────────────────────────────────────────────────────

  async createCustomer(email: string, description?: string): Promise<CyberSourceCustomerResult> {
    try {
      const res: any = await this.post('/tms/v2/customers', {
        buyerInformation: { email, merchantCustomerID: email },
        clientReferenceInformation: { comments: description ?? email },
      });
      return { success: true, customerId: res.id };
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource createCustomer failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ─── Payment Instrument (TMS — tokenized card) ────────────────────────────

  /**
   * transientTokenJwt: JWT from CyberSource Microform (frontend tokenization).
   * This keeps raw card data off your servers — PCI scope stays minimal.
   */
  async createPaymentInstrument(
    customerId: string,
    transientTokenJwt: string,
  ): Promise<CyberSourcePaymentMethodResult> {
    try {
      const res: any = await this.post(`/tms/v2/customers/${customerId}/payment-instruments`, {
        tokenInformation: { transientTokenJwt },
      });
      return { success: true, instrumentId: res.id };
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource createPaymentInstrument failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ─── Charge (once-off) ────────────────────────────────────────────────────

  /**
   * Direct charge using a Microform transient token JWT — no TMS customer/instrument required.
   * This is the recommended path for one-time charges with Flex Microform v2.
   */
  async chargeWithTransientToken(params: {
    transientTokenJwt: string;
    amount: number; // dollars
    currency: string;
    invoiceNumber?: string;
    idempotencyKey?: string;
  }): Promise<CyberSourceChargeResult> {
    try {
      const res: any = await this.post('/pts/v2/payments', {
        clientReferenceInformation: {
          code: params.idempotencyKey ?? params.invoiceNumber ?? this.requestId(),
        },
        processingInformation: { capture: true },
        tokenInformation: { transientTokenJwt: params.transientTokenJwt },
        orderInformation: {
          amountDetails: {
            totalAmount: params.amount.toFixed(2),
            currency: (params.currency ?? 'USD').toUpperCase(),
          },
        },
      });

      const status: string = res.status ?? '';
      const success = status === 'AUTHORIZED' || status === 'PENDING';
      return {
        success,
        transactionId: res.id,
        responseCode: res.processorInformation?.responseCode,
        message: res.errorInformation?.message ?? status,
      };
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource chargeWithTransientToken failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  async chargeCustomer(params: {
    customerId: string;
    instrumentId: string;
    amountCents: number;
    currency: string;
    invoiceNumber?: string;
    idempotencyKey?: string;
  }): Promise<CyberSourceChargeResult> {
    try {
      const res: any = await this.post('/pts/v2/payments', {
        clientReferenceInformation: {
          code: params.idempotencyKey ?? params.invoiceNumber ?? this.requestId(),
        },
        processingInformation: { capture: true },
        orderInformation: {
          amountDetails: {
            totalAmount: (params.amountCents / 100).toFixed(2),
            currency: (params.currency ?? 'USD').toUpperCase(),
          },
        },
        paymentInformation: {
          customer: { customerId: params.customerId },
          paymentInstrument: { id: params.instrumentId },
        },
      });

      const status: string = res.status ?? '';
      const success = status === 'AUTHORIZED' || status === 'PENDING';
      return {
        success,
        transactionId: res.id,
        responseCode: res.processorInformation?.responseCode,
        message: res.errorInformation?.message ?? status,
      };
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource chargeCustomer failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ─── Refund ───────────────────────────────────────────────────────────────

  async refundPayment(params: {
    transactionId: string;
    amountCents: number;
    currency: string;
  }): Promise<CyberSourceRefundResult> {
    try {
      const res: any = await this.post(`/pts/v2/payments/${params.transactionId}/refunds`, {
        clientReferenceInformation: { code: this.requestId() },
        orderInformation: {
          amountDetails: {
            totalAmount: (params.amountCents / 100).toFixed(2),
            currency: (params.currency ?? 'USD').toUpperCase(),
          },
        },
      });
      const success = (res.status ?? '') === 'PENDING';
      return { success, transactionId: res.id, message: res.status };
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource refundPayment failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ─── Microform v2 Capture Context ─────────────────────────────────────────

  /**
   * Generates a short-lived capture context JWT for CyberSource Microform v2.
   * The frontend uses this JWT to initialise the hosted card iframe.
   * targetOrigins must match the exact origin(s) of the payment page.
   */
  async generateCaptureContext(targetOrigins: string[]): Promise<string> {
    try {
      const captureContext = await this.post<string>('/microform/v2/sessions', {
        clientVersion: 'v2',
        targetOrigins,
        allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
      });
      return captureContext;
    } catch (err) {
      const msg = this.extractError(err);
      this.logger.error(`CyberSource generateCaptureContext failed: ${msg}`);
      throw new Error(msg);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private extractError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data as any;
      this.logger.error(`CyberSource HTTP ${status} — full body: ${JSON.stringify(data)}`);
      const detail =
        data?.message ??
        data?.errorInformation?.message ??
        data?.details?.[0]?.message ??
        data?.reason ??
        JSON.stringify(data);
      return detail ? `[${status}] ${detail}` : `HTTP ${status}: ${err.message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
