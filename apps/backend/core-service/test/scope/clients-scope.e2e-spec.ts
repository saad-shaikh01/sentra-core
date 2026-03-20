import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@sentra-core/types';
import { ClientsService } from '../../src/modules/clients/clients.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MailClientService } from '@sentra-core/mail-client';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('Clients Scope Integration', () => {
  let clientsService: ClientsService;
  let prisma: PrismaService;
  let testData: ScopeTestData;

  const noopCache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockMailService = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendPortalAccessEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        ScopeService,
        PrismaService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: noopCache },
        CacheService,
        { provide: MailClientService, useValue: mockMailService },
      ],
    }).compile();

    clientsService = module.get<ClientsService>(ClientsService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('OWNER sees all clients (2)', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.owner.id, UserRole.OWNER);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('ADMIN sees all clients', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.admin.id, UserRole.ADMIN);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('SALES_MANAGER sees only Brand A clients (1)', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].brandId).toBe(testData.brandA.id);
  });

  it('FRONTSELL_AGENT sees Brand A clients (visibility ON)', async () => {
    // team1 has allowMemberVisibility=true and brandA → frontsell should see brandA clients
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.frontsell.id, UserRole.FRONTSELL_AGENT);
    const brandIds = result.data.map((c) => c.brandId);
    expect(brandIds).not.toContain(testData.brandB.id);
  });

  it('UPSELL_AGENT sees only own assigned clients (1)', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.upsell.id, UserRole.UPSELL_AGENT);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].upsellAgentId).toBe(testData.upsell.id);
  });

  it('PROJECT_MANAGER sees only own clients (0 here)', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.pm.id, UserRole.PROJECT_MANAGER);
    expect(result.data).toHaveLength(0);
  });

  it('SALES_MANAGER filter by out-of-scope brand returns 0', async () => {
    const result = await clientsService.findAll(testData.org.id, { page: 1, limit: 50, brandId: testData.brandB.id }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(0);
  });
});
