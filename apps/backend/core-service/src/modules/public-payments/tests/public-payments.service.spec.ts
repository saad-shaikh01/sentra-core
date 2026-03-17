import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { AuthorizeNetService } from '../../authorize-net/authorize-net.service';
import { PublicPaymentsService } from '../public-payments.service';

describe('PublicPaymentsService', () => {
  let service: PublicPaymentsService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    invoice: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    paymentTransaction: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    sale: {
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };
  let authorizeNetMock: {
    createCustomerProfile: jest.Mock<Promise<any>, [unknown]>;
    createPaymentProfile: jest.Mock<Promise<any>, [unknown]>;
    chargeCustomerProfile: jest.Mock<Promise<any>, [unknown]>;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      invoice: {
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      paymentTransaction: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      sale: {
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
    authorizeNetMock = {
      createCustomerProfile: jest.fn<Promise<any>, [unknown]>(),
      createPaymentProfile: jest.fn<Promise<any>, [unknown]>(),
      chargeCustomerProfile: jest.fn<Promise<any>, [unknown]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicPaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: authorizeNetMock },
      ],
    }).compile();

    service = module.get<PublicPaymentsService>(PublicPaymentsService);
  });

  it('returns PublicInvoiceDto for valid UNPAID invoice token', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      dueDate: new Date('2026-03-25T00:00:00.000Z'),
      status: 'UNPAID',
      notes: null,
      paymentToken: 'abc123token',
      sale: {
        currency: 'USD',
        description: 'Web Design Package',
        brand: {
          name: 'Acme Co',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      },
    });

    const result = await service.getInvoiceByToken('abc123token');

    expect(result).toEqual({
      invoiceNumber: 'INV-2026-0001',
      amount: 500,
      currency: 'USD',
      dueDate: '2026-03-25T00:00:00.000Z',
      status: 'UNPAID',
      alreadyPaid: false,
      saleDescription: 'Web Design Package',
      installmentNote: undefined,
      brand: {
        name: 'Acme Co',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
      paymentToken: 'abc123token',
    });
  });

  it('returns alreadyPaid true for PAID invoice', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      invoiceNumber: 'INV-2026-0002',
      amount: { valueOf: () => 250 },
      dueDate: new Date('2026-03-25T00:00:00.000Z'),
      status: 'PAID',
      notes: 'Installment 1 of 2',
      paymentToken: 'paid-token',
      sale: {
        currency: 'USD',
        description: 'Maintenance Plan',
        brand: {
          name: 'Acme Co',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      },
    });

    const result = await service.getInvoiceByToken('paid-token');

    expect(result.status).toBe('PAID');
    expect(result.alreadyPaid).toBe(true);
  });

  it('throws NotFoundException for unknown token', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    await expect(service.getInvoiceByToken('missing-token')).rejects.toThrow(
      new NotFoundException('Invoice not found'),
    );
  });

  it('throws NotFoundException for empty token', async () => {
    await expect(service.getInvoiceByToken('')).rejects.toThrow(
      new NotFoundException('Invoice not found'),
    );
  });

  it('never includes internal ids in the response', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'invoice-id',
      saleId: 'sale-id',
      invoiceNumber: 'INV-2026-0003',
      amount: { valueOf: () => 99 },
      dueDate: new Date('2026-03-25T00:00:00.000Z'),
      status: 'OVERDUE',
      notes: null,
      paymentToken: 'safe-token',
      sale: {
        id: 'sale-id',
        organizationId: 'org-id',
        clientId: 'client-id',
        brandId: 'brand-id',
        currency: 'USD',
        description: 'SEO Package',
        brand: {
          name: 'Acme Co',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      },
    });

    const result = await service.getInvoiceByToken('safe-token');

    expect(Object.keys(result)).not.toEqual(
      expect.arrayContaining(['id', 'saleId', 'clientId', 'organizationId', 'brandId']),
    );
  });

  it('omits logoUrl when brand has no logo', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      invoiceNumber: 'INV-2026-0004',
      amount: { valueOf: () => 500 },
      dueDate: new Date('2026-03-25T00:00:00.000Z'),
      status: 'UNPAID',
      notes: null,
      paymentToken: 'no-logo-token',
      sale: {
        currency: 'USD',
        description: 'Brand Strategy',
        brand: {
          name: 'Acme Co',
          logoUrl: null,
        },
      },
    });

    const result = await service.getInvoiceByToken('no-logo-token');

    expect(result.brand.logoUrl).toBeUndefined();
  });

  it('omits saleDescription when sale has no description', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      invoiceNumber: 'INV-2026-0005',
      amount: { valueOf: () => 500 },
      dueDate: new Date('2026-03-25T00:00:00.000Z'),
      status: 'UNPAID',
      notes: null,
      paymentToken: 'no-description-token',
      sale: {
        currency: 'USD',
        description: null,
        brand: {
          name: 'Acme Co',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      },
    });

    const result = await service.getInvoiceByToken('no-description-token');

    expect(result.saleDescription).toBeUndefined();
  });

  it('pays a PENDING sale invoice successfully and activates the sale', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      status: 'UNPAID',
      paymentToken: 'validtoken123',
      sale: {
        id: 'sale-1',
        status: 'PENDING',
        customerProfileId: 'cust-profile-1',
        paymentProfileId: 'pay-profile-1',
        client: { email: 'client@example.com' },
      },
    });
    authorizeNetMock.chargeCustomerProfile.mockResolvedValue({
      success: true,
      transactionId: 'txn-1',
    });

    const result = await service.payInvoice('validtoken123', {
      opaqueData: {
        dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
        dataValue: 'opaque-data',
      },
    });

    expect(result).toEqual({
      success: true,
      invoiceNumber: 'INV-2026-0001',
      amountCharged: 500,
      message: 'Payment successful',
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { status: 'ACTIVE' },
    });
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'PAID' },
    });
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCESS',
          saleId: 'sale-1',
          invoiceId: 'inv-1',
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT_RECEIVED',
          saleId: 'sale-1',
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'STATUS_CHANGE',
          data: { from: 'PENDING', to: 'ACTIVE', trigger: 'first_public_payment' },
        }),
      }),
    );
  });

  it('pays an ACTIVE sale invoice without re-activating the sale or logging status change', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      status: 'UNPAID',
      paymentToken: 'validtoken123',
      sale: {
        id: 'sale-1',
        status: 'ACTIVE',
        customerProfileId: 'cust-profile-1',
        paymentProfileId: 'pay-profile-1',
        client: { email: 'client@example.com' },
      },
    });
    authorizeNetMock.chargeCustomerProfile.mockResolvedValue({
      success: true,
      transactionId: 'txn-1',
    });

    await service.payInvoice('validtoken123', {
      opaqueData: {
        dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
        dataValue: 'opaque-data',
      },
    });

    expect(prismaMock.sale.update).not.toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { status: 'ACTIVE' },
    });
    expect(prismaMock.saleActivity.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'STATUS_CHANGE',
        }),
      }),
    );
  });

  it('returns idempotent success for already paid invoice', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      status: 'PAID',
      paymentToken: 'validtoken123',
      sale: {
        id: 'sale-1',
        status: 'ACTIVE',
        customerProfileId: 'cust-profile-1',
        paymentProfileId: 'pay-profile-1',
        client: { email: 'client@example.com' },
      },
    });

    const result = await service.payInvoice('validtoken123', {
      opaqueData: {
        dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
        dataValue: 'opaque-data',
      },
    });

    expect(result).toEqual({
      success: true,
      alreadyPaid: true,
      invoiceNumber: 'INV-2026-0001',
      message: 'Invoice already paid',
    });
    expect(authorizeNetMock.chargeCustomerProfile).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException for non-payable invoice state', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      status: 'CANCELLED',
      paymentToken: 'validtoken123',
      sale: {
        id: 'sale-1',
        status: 'ACTIVE',
        customerProfileId: 'cust-profile-1',
        paymentProfileId: 'pay-profile-1',
        client: { email: 'client@example.com' },
      },
    } as any);

    await expect(
      service.payInvoice('validtoken123', {
        opaqueData: {
          dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
          dataValue: 'opaque-data',
        },
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns retryable failure and logs sanitized gateway failure', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      amount: { valueOf: () => 500 },
      status: 'UNPAID',
      paymentToken: 'validtoken123',
      sale: {
        id: 'sale-1',
        status: 'PENDING',
        customerProfileId: 'cust-profile-1',
        paymentProfileId: 'pay-profile-1',
        client: { email: 'client@example.com' },
      },
    });
    authorizeNetMock.chargeCustomerProfile.mockResolvedValue({
      success: false,
      message: 'Card declined ref 123456789012 for 550e8400-e29b-41d4-a716-446655440000',
      responseCode: '2',
    });

    const result = await service.payInvoice('validtoken123', {
      opaqueData: {
        dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
        dataValue: 'opaque-data',
      },
    });

    expect(result).toEqual({
      success: false,
      message: 'Card declined ref [ID] for [ID]',
      retryable: true,
    });
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          responseMessage: 'Card declined ref [ID] for [ID]',
          saleId: 'sale-1',
          invoiceId: 'inv-1',
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT_FAILED',
          saleId: 'sale-1',
          data: expect.objectContaining({
            reason: 'Card declined ref [ID] for [ID]',
            source: 'public_payment_link',
          }),
        }),
      }),
    );
  });

  it('throws NotFoundException for unknown payment token in pay flow', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    await expect(
      service.payInvoice('missing-token', {
        opaqueData: {
          dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
          dataValue: 'opaque-data',
        },
      }),
    ).rejects.toThrow(new NotFoundException('Invoice not found'));
  });
});
