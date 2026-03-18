import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { DepartmentsService } from './departments.service';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const prismaMock = {
    department: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(DepartmentsService);
  });

  it('remove throws conflict when employees are still assigned', async () => {
    prismaMock.department.findFirst.mockResolvedValue({
      id: 'dept-1',
      name: 'Operations',
    });
    prismaMock.user.count.mockResolvedValue(2);

    await expect(service.remove('dept-1', 'org-1')).rejects.toThrow(ConflictException);
  });
});
