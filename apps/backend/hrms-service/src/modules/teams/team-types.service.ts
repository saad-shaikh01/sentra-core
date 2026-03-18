import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CreateTeamTypeDto, UpdateTeamTypeDto } from './dto';

@Injectable()
export class TeamTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const teamTypes = await this.prisma.teamType.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return {
      data: teamTypes.map((teamType) => this.mapTeamType(teamType)),
    };
  }

  async create(organizationId: string, dto: CreateTeamTypeDto) {
    const name = dto.name.trim();
    const slug = this.slugify(name);
    await this.assertSlugAvailable(organizationId, slug);

    const teamType = await this.prisma.teamType.create({
      data: {
        organizationId,
        name,
        slug,
        isSystem: false,
      },
    });

    return this.mapTeamType(teamType);
  }

  async update(id: string, organizationId: string, dto: UpdateTeamTypeDto) {
    const teamType = await this.findAccessibleType(id, organizationId);
    if (teamType.isSystem || teamType.organizationId !== organizationId) {
      throw new BadRequestException('System team types cannot be modified');
    }

    const name = dto.name.trim();
    const slug = this.slugify(name);
    await this.assertSlugAvailable(organizationId, slug, id);

    const updated = await this.prisma.teamType.update({
      where: { id },
      data: { name, slug },
    });

    return this.mapTeamType(updated);
  }

  async remove(id: string, organizationId: string) {
    const teamType = await this.findAccessibleType(id, organizationId);
    if (teamType.isSystem || teamType.organizationId !== organizationId) {
      throw new BadRequestException('System team types cannot be deleted');
    }

    const teamCount = await this.prisma.team.count({
      where: {
        typeId: id,
        deletedAt: null,
      },
    });

    if (teamCount > 0) {
      throw new ConflictException('Cannot delete a team type that is in use');
    }

    await this.prisma.teamType.delete({
      where: { id },
    });

    return { message: 'Team type deleted' };
  }

  private async findAccessibleType(id: string, organizationId: string) {
    const teamType = await this.prisma.teamType.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });

    if (!teamType) {
      throw new NotFoundException('Team type not found');
    }

    return teamType;
  }

  private async assertSlugAvailable(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.teamType.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ organizationId }, { organizationId: null }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A team type with this name already exists');
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
  }

  private mapTeamType(teamType: {
    id: string;
    name: string;
    slug: string;
    isSystem: boolean;
    organizationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: teamType.id,
      name: teamType.name,
      slug: teamType.slug,
      isSystem: teamType.isSystem,
      organizationId: teamType.organizationId,
      createdAt: teamType.createdAt.toISOString(),
      updatedAt: teamType.updatedAt.toISOString(),
    };
  }
}
