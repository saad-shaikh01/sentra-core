import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { HrmsCacheService } from '../../common';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: HrmsCacheService, useValue: cacheMock },
      ],
    }).compile();

    service = module.get(EmployeesService);
  });

  it('create throws ConflictException if email already exists in org', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.create(
        'org-1',
        { email: 'user@example.com', firstName: 'Jane', lastName: 'Doe' },
        'admin-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('create does not throw when the org-level duplicate check misses and create succeeds', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(makeUserRecord({ organizationId: 'org-2' }));

    await expect(
      service.create(
        'org-2',
        { email: 'user@example.com', firstName: 'Jane', lastName: 'Doe' },
        'admin-1',
      ),
    ).resolves.toMatchObject({
      email: 'user@example.com',
      fullName: 'Jane Doe',
    });
  });

  it('deactivate throws if userId equals adminId', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord({ id: 'user-1' }));

    await expect(service.deactivate('user-1', 'org-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deactivate sets status, revokes refresh tokens, and blacklists the user', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord({ id: 'user-1' }));
    prismaMock.user.update.mockResolvedValue(
      makeUserRecord({ id: 'user-1', status: UserStatus.DEACTIVATED }),
    );
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.deactivate('user-1', 'org-1', 'admin-1');

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          status: UserStatus.DEACTIVATED,
          deactivatedBy: 'admin-1',
        }),
      }),
    );
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'USER_DEACTIVATED' }),
      }),
    );
    expect(cacheMock.set).toHaveBeenCalledWith('suspended:user-1', '1', 900_000);
    expect(result).toEqual({
      message: 'User deactivated and all sessions revoked',
      revokedSessions: 2,
    });
  });

  it('findAll returns partial name/email matches', async () => {
    prismaMock.$transaction.mockResolvedValue([
      [makeUserRecord({ name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })],
      1,
    ]);

    const result = await service.findAll('org-1', { search: '  jane  ', page: 1, limit: 20 });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.fullName).toBe('Jane Doe');
  });

  it('findAll supports appCode filtering', async () => {
    prismaMock.$transaction.mockResolvedValue([[makeUserRecord()], 1]);

    const result = await service.findAll('org-1', { appCode: 'HRMS', page: 1, limit: 20 });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(result.meta.total).toBe(1);
  });

  function makeUserRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: null,
      jobTitle: null,
      avatarUrl: null,
      status: UserStatus.INVITED,
      departmentId: null,
      suspendedAt: null,
      suspendReason: null,
      createdAt: new Date('2026-03-19T00:00:00.000Z'),
      updatedAt: new Date('2026-03-19T00:00:00.000Z'),
      appAccesses: [],
      appRoles: [],
      ...overrides,
    };
  }
});
