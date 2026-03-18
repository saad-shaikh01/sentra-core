import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { TeamTypesService } from './team-types.service';

describe('TeamTypesService', () => {
  let service: TeamTypesService;

  const prismaMock = {
    teamType: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TeamTypesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(TeamTypesService);
  });

  it('remove throws conflict when an active team uses the type', async () => {
    prismaMock.teamType.findFirst.mockResolvedValue({
      id: 'type-1',
      organizationId: 'org-1',
      isSystem: false,
    });
    prismaMock.team.count.mockResolvedValue(1);

    await expect(service.remove('type-1', 'org-1')).rejects.toThrow(ConflictException);
  });

  it('update rejects system team types', async () => {
    prismaMock.teamType.findFirst.mockResolvedValue({
      id: 'type-1',
      organizationId: null,
      isSystem: true,
    });

    await expect(service.update('type-1', 'org-1', { name: 'Design' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
