import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@sentra-core/types';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { UserScope } from '../../src/modules/scope/user-scope.class';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('ScopeService', () => {
  let scopeService: ScopeService;
  let prisma: PrismaService;
  let testData: ScopeTestData;

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeService,
        PrismaService,
        ConfigService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        CacheService,
      ],
    }).compile();

    scopeService = module.get<ScopeService>(ScopeService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OWNER scope', () => {
    it('returns full access scope with no team queries', async () => {
      const scope = await scopeService.getUserScope(testData.owner.id, testData.org.id, UserRole.OWNER);
      expect(scope.isFullAccess).toBe(true);
      expect(scope.toLeadFilter()).toEqual({ organizationId: testData.org.id });
    });

    it('toClientFilter returns only organizationId for OWNER', async () => {
      const scope = await scopeService.getUserScope(testData.owner.id, testData.org.id, UserRole.OWNER);
      expect(scope.toClientFilter()).toEqual({ organizationId: testData.org.id });
    });
  });

  describe('SALES_MANAGER scope', () => {
    it('includes team brands in brandIds', async () => {
      const scope = await scopeService.getUserScope(testData.manager.id, testData.org.id, UserRole.SALES_MANAGER);
      expect(scope.isManager).toBe(true);
      const filter = scope.toLeadFilter();
      expect(filter.brandId?.in).toContain(testData.brandA.id);
      expect(filter.brandId?.in).not.toContain(testData.brandB.id);
      expect(filter.brandId?.in).not.toContain(testData.brandC.id);
    });
  });

  describe('FRONTSELL_AGENT scope', () => {
    it('returns own-assigned filter for leads', async () => {
      const scope = await scopeService.getUserScope(testData.frontsell.id, testData.org.id, UserRole.FRONTSELL_AGENT);
      expect(scope.toLeadFilter()).toMatchObject({ assignedToId: testData.frontsell.id });
    });

    it('returns brand filter for clients when team has visibility ON', async () => {
      const scope = await scopeService.getUserScope(testData.frontsell.id, testData.org.id, UserRole.FRONTSELL_AGENT);
      const filter = scope.toClientFilter();
      // team1 has allowMemberVisibility=true
      expect(filter.brandId?.in).toContain(testData.brandA.id);
    });
  });

  describe('UPSELL_AGENT scope', () => {
    it('returns own-assigned filter for leads and client-based filter for sales', async () => {
      const scope = await scopeService.getUserScope(testData.upsell.id, testData.org.id, UserRole.UPSELL_AGENT);
      expect(scope.toLeadFilter()).toMatchObject({ assignedToId: testData.upsell.id });
      expect(scope.toSaleFilter()).toMatchObject({ client: { is: { upsellAgentId: testData.upsell.id } } });
    });

    it('returns upsellAgentId filter for clients', async () => {
      const scope = await scopeService.getUserScope(testData.upsell.id, testData.org.id, UserRole.UPSELL_AGENT);
      expect(scope.toClientFilter()).toMatchObject({ upsellAgentId: testData.upsell.id });
    });
  });

  describe('PROJECT_MANAGER scope', () => {
    it('returns impossible filter for leads (no access)', async () => {
      const scope = await scopeService.getUserScope(testData.pm.id, testData.org.id, UserRole.PROJECT_MANAGER);
      expect(scope.toLeadFilter()).toMatchObject({ assignedToId: '__none__' });
    });

    it('returns projectManagerId filter for clients', async () => {
      const scope = await scopeService.getUserScope(testData.pm.id, testData.org.id, UserRole.PROJECT_MANAGER);
      expect(scope.toClientFilter()).toMatchObject({ projectManagerId: testData.pm.id });
    });
  });

  describe('cache behavior', () => {
    it('uses cache on second call', async () => {
      const cachedData = { userId: testData.manager.id, orgId: testData.org.id, role: UserRole.SALES_MANAGER, teamIds: [], managedTeamIds: [], brandIds: [testData.brandA.id], memberVisibleTeamIds: [] };
      mockCacheManager.get.mockResolvedValueOnce(cachedData);

      const scope = await scopeService.getUserScope(testData.manager.id, testData.org.id, UserRole.SALES_MANAGER);
      expect(scope.isManager).toBe(true);
      expect(mockCacheManager.get).toHaveBeenCalled();
    });

    it('invalidateUser deletes cache key', async () => {
      await scopeService.invalidateUser(testData.manager.id, testData.org.id);
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        `scope:${testData.org.id}:${testData.manager.id}`,
      );
    });

    it('invalidateTeam deletes all team member caches', async () => {
      mockCacheManager.del.mockClear();
      await scopeService.invalidateTeam(testData.team1.id, testData.org.id);
      // team1 members: frontsell + manager (as manager) — at least 2 cache keys deleted
      expect(mockCacheManager.del.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('UserScope filter methods', () => {
    it('toInvoiceFilter wraps toSaleFilter for non-admin roles', async () => {
      const scope = await scopeService.getUserScope(testData.manager.id, testData.org.id, UserRole.SALES_MANAGER);
      const invoiceFilter = scope.toInvoiceFilter();
      expect(invoiceFilter.sale).toBeDefined();
      expect(invoiceFilter.sale?.is?.brandId?.in).toContain(testData.brandA.id);
    });

    it('toInvoiceFilter returns empty for OWNER', async () => {
      const scope = await scopeService.getUserScope(testData.owner.id, testData.org.id, UserRole.OWNER);
      expect(scope.toInvoiceFilter()).toEqual({});
    });
  });
});
