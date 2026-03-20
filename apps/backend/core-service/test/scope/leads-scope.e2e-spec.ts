import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@sentra-core/types';
import { LeadsService } from '../../src/modules/leads/leads.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { TeamBrandHelper } from '../../src/modules/scope/team-brand.helper';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('Leads Scope Integration', () => {
  let leadsService: LeadsService;
  let prisma: PrismaService;
  let testData: ScopeTestData;

  const noopCache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        ScopeService,
        TeamBrandHelper,
        PrismaService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: noopCache },
        CacheService,
      ],
    }).compile();

    leadsService = module.get<LeadsService>(LeadsService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('OWNER sees all 4 leads', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.owner.id, UserRole.OWNER);
    expect(result.data.length).toBeGreaterThanOrEqual(4);
  });

  it('SALES_MANAGER sees only Brand A leads (2)', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((l) => l.brandId === testData.brandA.id)).toBe(true);
  });

  it('FRONTSELL_AGENT sees only own assigned leads (1)', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.frontsell.id, UserRole.FRONTSELL_AGENT);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].assignedToId).toBe(testData.frontsell.id);
  });

  it('UPSELL_AGENT sees only own assigned lead (1)', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.upsell.id, UserRole.UPSELL_AGENT);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].assignedToId).toBe(testData.upsell.id);
  });

  it('PROJECT_MANAGER sees 0 leads', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.pm.id, UserRole.PROJECT_MANAGER);
    expect(result.data).toHaveLength(0);
  });

  it('SALES_MANAGER filter by out-of-scope brand returns 0', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50, brandId: testData.brandB.id }, testData.manager.id, UserRole.SALES_MANAGER);
    expect(result.data).toHaveLength(0);
  });

  it('OWNER total count reflects all org leads', async () => {
    const result = await leadsService.findAll(testData.org.id, { page: 1, limit: 50 }, testData.owner.id, UserRole.OWNER);
    expect(result.meta.total).toBeGreaterThanOrEqual(4);
  });
});
