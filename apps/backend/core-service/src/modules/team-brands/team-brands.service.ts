import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ScopeService } from '../scope/scope.service';
import { AssignBrandDto } from './dto';

@Injectable()
export class TeamBrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) {}

  async findAll(orgId: string) {
    return this.prisma.teamBrand.findMany({
      where: {
        team: { organizationId: orgId, deletedAt: null },
      },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
      orderBy: { team: { name: 'asc' } },
    });
  }

  async assign(dto: AssignBrandDto, orgId: string) {
    const [team, brand] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: dto.teamId, organizationId: orgId, deletedAt: null },
      }),
      this.prisma.brand.findFirst({
        where: { id: dto.brandId, organizationId: orgId },
      }),
    ]);

    if (!team) throw new NotFoundException('Team not found');
    if (!brand) throw new NotFoundException('Brand not found');

    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId: dto.brandId },
      select: { teamId: true, team: { select: { name: true } } },
    });

    if (existing && existing.teamId !== dto.teamId) {
      throw new ConflictException(
        `Brand is already assigned to team "${existing.team.name}". Unassign it first.`,
      );
    }

    const result = await this.prisma.teamBrand.upsert({
      where: { brandId: dto.brandId },
      create: { teamId: dto.teamId, brandId: dto.brandId },
      update: { teamId: dto.teamId },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    await this.scopeService.invalidateTeam(dto.teamId, orgId);

    return result;
  }

  async unassign(brandId: string, orgId: string) {
    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true, team: { select: { organizationId: true } } },
    });

    if (!existing) throw new NotFoundException('Brand is not assigned to any team');
    if (existing.team.organizationId !== orgId) throw new NotFoundException('Not found');

    await this.prisma.teamBrand.delete({ where: { brandId } });
    await this.scopeService.invalidateTeam(existing.teamId, orgId);

    return { ok: true };
  }

  async reassign(brandId: string, newTeamId: string, orgId: string) {
    const newTeam = await this.prisma.team.findFirst({
      where: { id: newTeamId, organizationId: orgId, deletedAt: null },
    });
    if (!newTeam) throw new NotFoundException('Team not found');

    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true },
    });
    const oldTeamId = existing?.teamId;

    const result = await this.prisma.teamBrand.upsert({
      where: { brandId },
      create: { teamId: newTeamId, brandId },
      update: { teamId: newTeamId },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    if (oldTeamId) await this.scopeService.invalidateTeam(oldTeamId, orgId);
    await this.scopeService.invalidateTeam(newTeamId, orgId);

    return result;
  }
}
