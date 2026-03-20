import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TeamBrandsService } from '../../src/modules/team-brands/team-brands.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../src/common';
import { ConfigService } from '@nestjs/config';
import { ScopeService } from '../../src/modules/scope/scope.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createScopeTestData, cleanupScopeTestData, ScopeTestData } from './helpers/scope-test-setup';

describe('TeamBrands Service', () => {
  let service: TeamBrandsService;
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
        TeamBrandsService,
        ScopeService,
        PrismaService,
        ConfigService,
        { provide: CACHE_MANAGER, useValue: noopCache },
        CacheService,
      ],
    }).compile();

    service = module.get<TeamBrandsService>(TeamBrandsService);
    prisma = module.get<PrismaService>(PrismaService);
    testData = await createScopeTestData(prisma);
  });

  afterAll(async () => {
    await cleanupScopeTestData(prisma, testData.org.id);
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('findAll returns all brand-team mappings for org', async () => {
    const result = await service.findAll(testData.org.id);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const brandIds = result.map((r) => r.brandId);
    expect(brandIds).toContain(testData.brandA.id);
    expect(brandIds).toContain(testData.brandB.id);
  });

  it('assign throws 409 when brand already assigned to different team', async () => {
    await expect(
      service.assign({ brandId: testData.brandA.id, teamId: testData.team2.id }, testData.org.id),
    ).rejects.toThrow(ConflictException);
  });

  it('assign is idempotent for same team', async () => {
    const result = await service.assign(
      { brandId: testData.brandA.id, teamId: testData.team1.id },
      testData.org.id,
    );
    expect(result.brandId).toBe(testData.brandA.id);
    expect(result.teamId).toBe(testData.team1.id);
  });

  it('unassign removes brand from team', async () => {
    // Assign brandC to team1 first
    await service.assign({ brandId: testData.brandC.id, teamId: testData.team1.id }, testData.org.id);
    // Then unassign
    const result = await service.unassign(testData.brandC.id, testData.org.id);
    expect(result.ok).toBe(true);
    // Verify removed
    const remaining = await service.findAll(testData.org.id);
    expect(remaining.map((r) => r.brandId)).not.toContain(testData.brandC.id);
  });

  it('unassign throws 404 when brand not assigned', async () => {
    await expect(
      service.unassign(testData.brandC.id, testData.org.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('reassign moves brand to new team and invalidates both scopes', async () => {
    const result = await service.reassign(
      testData.brandA.id,
      testData.team2.id,
      testData.org.id,
    );
    expect(result.teamId).toBe(testData.team2.id);
    // Restore original assignment
    await service.reassign(testData.brandA.id, testData.team1.id, testData.org.id);
  });
});
