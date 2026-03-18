import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PrismaService,
  TeamMemberRole,
  UserStatus,
} from '@sentra-core/prisma-client';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let service: TeamsService;

  const prismaMock = {
    team: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    teamType: {
      findUnique: jest.fn(),
    },
    teamMember: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (operations: any[]) => Promise.all(operations));
    prismaMock.team.findMany.mockResolvedValue([]);
    prismaMock.team.count.mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(TeamsService);
  });

  it('create validates manager belongs to the same organization', async () => {
    prismaMock.team.findFirst.mockResolvedValue(null);
    prismaMock.teamType.findUnique.mockResolvedValue({
      id: 'type-1',
      organizationId: null,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'manager-1',
      organizationId: 'org-2',
      status: UserStatus.ACTIVE,
    });

    await expect(
      service.create(
        'org-1',
        { name: 'Alpha Team', typeId: 'type-1', managerId: 'manager-1' },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('create validates the team type belongs to the org or is a system type', async () => {
    prismaMock.team.findFirst.mockResolvedValue(null);
    prismaMock.teamType.findUnique.mockResolvedValue({
      id: 'type-1',
      organizationId: 'org-2',
    });

    await expect(
      service.create('org-1', { name: 'Alpha Team', typeId: 'type-1' }, 'admin-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('addMember validates user belongs to the same org', async () => {
    prismaMock.team.findFirst.mockResolvedValue({
      id: 'team-1',
      name: 'Alpha Team',
      typeId: 'type-1',
      managerId: null,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-2',
      status: UserStatus.ACTIVE,
    });

    await expect(
      service.addMember(
        'team-1',
        'org-1',
        { userId: 'user-1', role: TeamMemberRole.MEMBER },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('addMember throws ConflictException if user already exists in team', async () => {
    prismaMock.team.findFirst.mockResolvedValue({
      id: 'team-1',
      name: 'Alpha Team',
      typeId: 'type-1',
      managerId: null,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      status: UserStatus.ACTIVE,
    });
    prismaMock.teamMember.findFirst.mockResolvedValue({ id: 'member-1' });

    await expect(
      service.addMember(
        'team-1',
        'org-1',
        { userId: 'user-1', role: TeamMemberRole.MEMBER },
        'admin-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('softDelete sets deletedAt and does not delete the record', async () => {
    prismaMock.team.findFirst.mockResolvedValue({
      id: 'team-1',
      name: 'Alpha Team',
      typeId: 'type-1',
      managerId: null,
    });
    prismaMock.team.update.mockResolvedValue({});

    const result = await service.softDelete('team-1', 'org-1', 'admin-1');

    expect(prismaMock.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team-1' },
        data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
      }),
    );
    expect(result).toEqual({ message: 'Team deleted' });
  });

  it('findAll excludes soft-deleted teams by default and can query inactive teams', async () => {
    await service.findAll('org-1', { page: 1, limit: 20 });
    await service.findAll('org-1', { page: 1, limit: 20, isActive: false });

    expect(prismaMock.team.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      isActive: true,
      deletedAt: null,
    });
    expect(prismaMock.team.findMany.mock.calls[1][0].where).toMatchObject({
      organizationId: 'org-1',
      isActive: false,
    });
  });
});
