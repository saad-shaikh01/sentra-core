import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@sentra-core/types';
import { SalesService } from '../../src/modules/sales/sales.service';
import { PrismaService, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getQueueToken } from '@nestjs/bullmq';
import { AuthorizeNetService } from '../../src/modules/authorize-net';
import { SalesNotificationService } from '../../src/modules/sales/sales-notification.service';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('Sales Scope Integration', () => {
  let salesService: SalesService;
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
  };

  const mockSalesNotification = {
    notifySaleCreated: jest.fn().mockResolvedValue(undefined),
    notifySaleStatusChanged: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotifQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        ScopeService,
        PrismaService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: noopCache },
        CacheService,
        { provide: AuthorizeNetService, useValue: mockAuthorizeNet },
        { provide: SalesNotificationService, useValue: mockSalesNotification },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: mockNotifQueue },
      ],
    }).compile();

    salesService = module.get<SalesService>(SalesService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('OWNER sees all sales (2)', async () => {
    const result = await salesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.owner.id, UserRole.OWNER);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('SALES_MANAGER sees only Brand A sales (1)', async () => {
    const result = await salesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].brandId).toBe(testData.brandA.id);
  });

  it('UPSELL_AGENT sees sales for their assigned clients (1)', async () => {
    const result = await salesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.upsell.id, UserRole.UPSELL_AGENT);
    // clientA has upsellAgentId=upsell and saleA belongs to clientA
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(testData.saleA.id);
  });

  it('PROJECT_MANAGER sees 0 sales', async () => {
    const result = await salesService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.pm.id, UserRole.PROJECT_MANAGER);
    expect(result.data).toHaveLength(0);
  });

  it('SALES_MANAGER filter by out-of-scope brand returns 0', async () => {
    const result = await salesService.findAll(testData.org.id, { page: 1, limit: 50, brandId: testData.brandB.id }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(0);
  });
});
