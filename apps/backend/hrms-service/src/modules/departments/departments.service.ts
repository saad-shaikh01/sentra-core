import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const departments = await this.prisma.department.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: {
            employees: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return {
      data: departments.map((department) => this.mapDepartment(department)),
    };
  }

  async create(organizationId: string, dto: CreateDepartmentDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(organizationId, name);

    const department = await this.prisma.department.create({
      data: {
        organizationId,
        name,
        description: dto.description?.trim() || null,
      },
      include: {
        _count: {
          select: {
            employees: true,
          },
        },
      },
    });

    return this.mapDepartment(department);
  }

  async update(id: string, organizationId: string, dto: UpdateDepartmentDto) {
    const department = await this.findDepartment(id, organizationId);
    const name = dto.name?.trim() ?? department.name;
    await this.assertNameAvailable(organizationId, name, id);

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        name,
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
      include: {
        _count: {
          select: {
            employees: true,
          },
        },
      },
    });

    return this.mapDepartment(updated);
  }

  async remove(id: string, organizationId: string) {
    await this.findDepartment(id, organizationId);

    const employeeCount = await this.prisma.user.count({
      where: {
        organizationId,
        departmentId: id,
      },
    });

    if (employeeCount > 0) {
      throw new ConflictException('Cannot delete a department that still has employees assigned');
    }

    await this.prisma.department.delete({
      where: { id },
    });

    return { message: 'Department deleted' };
  }

  private async findDepartment(id: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  private async assertNameAvailable(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: {
        organizationId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A department with this name already exists');
    }
  }

  private mapDepartment(department: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { employees: number };
  }) {
    return {
      id: department.id,
      name: department.name,
      description: department.description ?? null,
      employeeCount: department._count.employees,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }
}
