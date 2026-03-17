import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PaymentPlanType } from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

describe('SalesService invoice generation', () => {
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthorizeNetService, useValue: {} },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            delByPrefix: jest.fn().mockResolvedValue(undefined),
            hashQuery: jest.fn().mockReturnValue('hash'),
          },
        },
        { provide: TeamsService, useValue: { getMemberIds: jest.fn().mockResolvedValue([]) } },
        {
          provide: SalesNotificationService,
          useValue: {
            dispatch: jest.fn().mockResolvedValue(undefined),
            resolveRecipientsByRole: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  function createTx() {
    const currentYear = new Date().getFullYear();
    let sequence = 0;
    let invoiceCount = 0;

    return {
      $executeRaw: jest.fn().mockResolvedValue(1),
      invoiceSequence: {
        findUnique: jest.fn().mockImplementation(async () => {
          sequence += 1;
          return { lastSeq: sequence, year: currentYear, brandId: 'brand-1' };
        }),
      },
      invoice: {
        create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
          invoiceCount += 1;
          return {
            id: `invoice-${invoiceCount}`,
            invoiceNumber: data.invoiceNumber,
            amount: data.amount,
            dueDate: data.dueDate,
            saleId: data.saleId,
            paymentToken: data.paymentToken,
            notes: data.notes,
          };
        }),
      },
    };
  }

  it('ONE_TIME creates one invoice with paymentToken and INV-YYYY-NNNN number', async () => {
    const tx = createTx();
    const before = Date.now();

    const invoices = await (service as any).generateInvoices(
      tx,
      'sale-1',
      250,
      PaymentPlanType.ONE_TIME,
      null,
      'USD',
      'brand-1',
    );

    const [invoice] = invoices;
    expect(invoices).toHaveLength(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
    expect(invoice.paymentToken).toMatch(/^[a-f0-9]{64}$/);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(invoice.amount).toBe(250);

    const dueDateDiffMs = invoice.dueDate.getTime() - before;
    const sixDays = 6 * 24 * 60 * 60 * 1000;
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    expect(dueDateDiffMs).toBeGreaterThan(sixDays);
    expect(dueDateDiffMs).toBeLessThan(eightDays);
  });

  it('INSTALLMENTS(3, 100) creates 3 invoices with unique payment tokens and sequential numbers', async () => {
    const tx = createTx();
    const currentYear = new Date().getFullYear();

    const invoices = await (service as any).generateInvoices(
      tx,
      'sale-1',
      100,
      PaymentPlanType.INSTALLMENTS,
      3,
      'USD',
      'brand-1',
    );

    expect(invoices).toHaveLength(3);
    expect(tx.invoice.create).toHaveBeenCalledTimes(3);
    expect(invoices.map((invoice: any) => invoice.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(new Set(invoices.map((invoice: any) => invoice.paymentToken)).size).toBe(3);
    expect(invoices.every((invoice: any) => /^[a-f0-9]{64}$/.test(invoice.paymentToken))).toBe(true);
    expect(invoices.map((invoice: any) => invoice.invoiceNumber)).toEqual([
      `INV-${currentYear}-0001`,
      `INV-${currentYear}-0002`,
      `INV-${currentYear}-0003`,
    ]);
  });

  it('INSTALLMENTS rounding splits 1.00 into 0.33, 0.33, 0.34', async () => {
    const tx = createTx();

    const invoices = await (service as any).generateInvoices(
      tx,
      'sale-1',
      1,
      PaymentPlanType.INSTALLMENTS,
      3,
      'USD',
      'brand-1',
    );

    expect(invoices.map((invoice: any) => invoice.amount)).toEqual([0.33, 0.33, 0.34]);
  });

  it('SUBSCRIPTION creates no invoices', async () => {
    const tx = createTx();

    const invoices = await (service as any).generateInvoices(
      tx,
      'sale-1',
      500,
      PaymentPlanType.SUBSCRIPTION,
      null,
      'USD',
      'brand-1',
    );

    expect(invoices).toEqual([]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});
