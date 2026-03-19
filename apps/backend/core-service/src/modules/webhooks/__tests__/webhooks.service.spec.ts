import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  InvoiceStatus,
  SaleActivityType,
  SaleStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
} from '@sentra-core/types';
import * as crypto from 'crypto';
import { SalesNotificationService } from '../../sales';
import { WebhooksService } from '../webhooks.service';
import { AuthorizeNetWebhookPayload } from '../dto/authorize-net-webhook.dto';

const saleId = 'sale-1';
const transactionId = 'anet-tx-1';
const subscriptionId = 'sub-1';

function makePayload(
  eventType: string,
  overrides: Partial<AuthorizeNetWebhookPayload['payload']> = {},
): AuthorizeNetWebhookPayload {
  return {
    notificationId: 'notification-1',
    eventType,
    eventDate: '2026-03-17T00:00:00.000Z',
    webhookId: 'webhook-1',
    payload: {
      id: transactionId,
      subscriptionId,
      authAmount: 99.5,
      responseCode: 1,
      ...overrides,
    },
  };
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    paymentTransaction: {
      findFirst: jest.Mock<Promise<any>, [unknown]>;
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    sale: {
      findFirst: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    invoice: {
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };
  let configMock: {
    get: jest.Mock<string | undefined, [string]>;
  };
  let salesNotificationServiceMock: {
    dispatch: jest.Mock<Promise<void>, [unknown]>;
    resolveRecipientsByRole: jest.Mock<Promise<string[]>, [string, UserRole[]]>;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      paymentTransaction: {
        findFirst: jest.fn<Promise<any>, [unknown]>(),
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      sale: {
        findFirst: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      invoice: {
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return callback(prismaMock);
      }

      return Promise.all(callback as Promise<unknown>[]);
    });

    configMock = {
      get: jest.fn<string | undefined, [string]>(),
    };
    salesNotificationServiceMock = {
      dispatch: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
      resolveRecipientsByRole: jest
        .fn<Promise<string[]>, [string, UserRole[]]>()
        .mockResolvedValue(['user-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SalesNotificationService, useValue: salesNotificationServiceMock },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('verifyAuthorizeNetSignature returns true for a valid HMAC', () => {
    const rawBody = JSON.stringify(makePayload('net.authorize.payment.capture.created'));
    configMock.get.mockReturnValue('secret-key');
    const signature = `sha512=${crypto
      .createHmac('sha512', 'secret-key')
      .update(rawBody, 'utf8')
      .digest('hex')
      .toUpperCase()}`;

    expect(service.verifyAuthorizeNetSignature(rawBody, signature)).toBe(true);
  });

  it('verifyAuthorizeNetSignature returns false for a tampered body', () => {
    const rawBody = JSON.stringify(makePayload('net.authorize.payment.capture.created'));
    configMock.get.mockReturnValue('secret-key');
    const signature = `sha512=${crypto
      .createHmac('sha512', 'secret-key')
      .update(rawBody, 'utf8')
      .digest('hex')
      .toUpperCase()}`;

    expect(service.verifyAuthorizeNetSignature(`${rawBody}tampered`, signature)).toBe(false);
  });

  it('verifyAuthorizeNetSignature returns false when AUTHORIZE_NET_SIGNATURE_KEY is missing', () => {
    configMock.get.mockReturnValue(undefined);

    expect(service.verifyAuthorizeNetSignature('{}', 'sha512=ABC')).toBe(false);
  });

  it('handlePaymentReceived creates payment transaction, pays oldest invoice, activates pending sale, and logs PAYMENT_RECEIVED', async () => {
    prismaMock.paymentTransaction.findFirst.mockResolvedValue(null);
    prismaMock.sale.findFirst.mockResolvedValue({
      id: saleId,
      status: SaleStatus.PENDING,
      invoices: [
        { id: 'invoice-1', status: InvoiceStatus.UNPAID, dueDate: new Date('2026-04-01T00:00:00.000Z') },
      ],
    });
    prismaMock.paymentTransaction.create.mockResolvedValue({ id: 'payment-1' });
    prismaMock.invoice.update.mockResolvedValue({ id: 'invoice-1', status: InvoiceStatus.PAID });
    prismaMock.sale.update.mockResolvedValue({ id: saleId, status: SaleStatus.ACTIVE });
    prismaMock.saleActivity.create.mockResolvedValue({ id: 'activity-1' });

    await service.processEvent(makePayload('net.authorize.payment.capture.created'));

    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId,
          type: TransactionType.ONE_TIME,
          amount: 99.5,
          status: TransactionStatus.SUCCESS,
          saleId,
          invoiceId: 'invoice-1',
        }),
      }),
    );
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: InvoiceStatus.PAID },
    });
    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: { status: SaleStatus.ACTIVE },
    });
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.PAYMENT_RECEIVED,
          data: {
            transactionId,
            amount: 99.5,
            subscriptionId,
            invoiceId: 'invoice-1',
          },
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.STATUS_CHANGE,
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.INVOICE_UPDATED,
        }),
      }),
    );
  });

  it('handlePaymentReceived returns early for duplicate transactionId', async () => {
    prismaMock.paymentTransaction.findFirst.mockResolvedValue({ id: 'existing-transaction' });

    await service.processEvent(makePayload('net.authorize.payment.authcapture.created'));

    expect(prismaMock.sale.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('processEvent does not throw for unknown event type', async () => {
    await expect(
      service.processEvent(makePayload('net.authorize.payment.unknown')),
    ).resolves.toBeUndefined();
  });

  it('handleFraudDeclined logs PAYMENT_FAILED activity', async () => {
    prismaMock.sale.findFirst.mockResolvedValue({
      id: saleId,
      organizationId: 'org-1',
      deletedAt: null,
      invoices: [],
    });
    prismaMock.saleActivity.create.mockResolvedValue({ id: 'activity-1' });

    await service.processEvent(makePayload('net.authorize.payment.fraud.declined'));
    await Promise.resolve();

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId,
          type: SaleActivityType.PAYMENT_FAILED,
          data: {
            amount: 99.5,
            reason: 'Fraud review declined',
            transactionId,
          },
        }),
      }),
    );
    expect(salesNotificationServiceMock.resolveRecipientsByRole).toHaveBeenCalledWith(
      'org-1',
      [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
    );
    expect(salesNotificationServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT_FAILED',
        saleId,
        organizationId: 'org-1',
      }),
    );
  });
});
