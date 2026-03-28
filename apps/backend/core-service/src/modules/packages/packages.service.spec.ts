import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

describe('PackagesService', () => {
  let service: PackagesService;
  let prismaMock: {
    productPackage: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    packageItem: {
      deleteMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    brand: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      productPackage: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      packageItem: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      brand: {
        findFirst: jest.fn().mockResolvedValue({ id: 'brand-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(PackagesService);
  });

  it('creates a package with rich content', async () => {
    prismaMock.productPackage.create.mockResolvedValue({
      id: 'pkg-1',
      name: 'Standard Package',
      description: 'Desc',
      content: '<p><strong>Rich</strong> content</p>',
      isActive: true,
      category: 'PUBLISHING',
      price: 100,
      currency: 'USD',
      brandId: 'brand-1',
      organizationId: 'org-1',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create('org-1', {
      name: 'Standard Package',
      description: 'Desc',
      contentHtml: '<p><strong>Rich</strong> content</p>',
      brandId: 'brand-1',
      price: 100,
      currency: 'USD',
    } as CreatePackageDto);

    expect(prismaMock.productPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '<p><strong>Rich</strong> content</p>',
        }),
      }),
    );
    expect(result.contentHtml).toBe('<p><strong>Rich</strong> content</p>');
  });

  it('updates a package rich content', async () => {
    prismaMock.productPackage.findFirst.mockResolvedValue({
      id: 'pkg-1',
      name: 'Standard Package',
      description: 'Desc',
      content: '<p>Old</p>',
      isActive: true,
      category: 'PUBLISHING',
      price: 100,
      currency: 'USD',
      brandId: 'brand-1',
      organizationId: 'org-1',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.productPackage.update.mockResolvedValue({
      id: 'pkg-1',
      name: 'Updated Package',
      description: 'New desc',
      content: '<p>New rich content</p>',
      isActive: true,
      category: 'PUBLISHING',
      price: 150,
      currency: 'USD',
      brandId: 'brand-1',
      organizationId: 'org-1',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.update('pkg-1', 'org-1', {
      contentHtml: '<p>New rich content</p>',
    } as UpdatePackageDto);

    expect(prismaMock.productPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '<p>New rich content</p>',
        }),
      }),
    );
    expect(result.contentHtml).toBe('<p>New rich content</p>');
  });

  it('rejects invalid brand on create', async () => {
    prismaMock.brand.findFirst.mockResolvedValue(null);

    await expect(
      service.create('org-1', {
        name: 'Standard Package',
        brandId: 'brand-1',
      } as CreatePackageDto),
    ).rejects.toThrow(BadRequestException);
  });
});
