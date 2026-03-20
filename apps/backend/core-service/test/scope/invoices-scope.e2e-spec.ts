import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@sentra-core/types';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuthorizeNetService } from '../../src/modules/authorize-net';
import { InvoicePdfService } from '../../src/modules/invoices/pdf/invoice-pdf.service';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('Invoices Scope Integration', () => {
  let invoicesService: InvoicesService;
  let prisma: PrismaService;
  let testData: ScopeTestData;

  const noopCache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuthorizeNet = {
    createCustomerProfile: jest.fn(),
    chargeCustomerProfile: jest.fn(),
    getCustomerProfile: jest.fn(),
  };

  const mockPdfService = {
    generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        ScopeService,
        PrismaService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: noopCache },
        CacheService,
        { provide: AuthorizeNetService, useValue: mockAuthorizeNet },
        { provide: InvoicePdfService, useValue: mockPdfService },
      ],
    }).compile();

    invoicesService = module.get<InvoicesService>(InvoicesService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('OWNER sees all invoices (2)', async () => {
    const result = await invoicesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.owner.id, UserRole.OWNER);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('SALES_MANAGER sees only Brand A invoices (1)', async () => {
    const result = await invoicesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(1);
    // Invoice saleA belongs to brandA
    expect(result.data[0].saleId).toBe(testData.saleA.id);
  });

  it('PROJECT_MANAGER sees 0 invoices', async () => {
    const result = await invoicesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.pm.id, UserRole.PROJECT_MANAGER);
    expect(result.data).toHaveLength(0);
  });

  it('ADMIN sees all invoices (same as OWNER)', async () => {
    const result = await invoicesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.admin.id, UserRole.ADMIN);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });
});
