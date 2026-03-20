import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';

@Injectable()
export class TeamBrandHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve which team owns a brand. Returns null if brand has no team mapping.
   */
  async resolveTeamForBrand(brandId: string): Promise<string | null> {
    const mapping = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true },
    });
    return mapping?.teamId ?? null;
  }

  /**
   * Batch resolve teamIds for multiple brands in one query.
   * Returns a Map of brandId → teamId.
   */
  async resolveBrandTeamMap(brandIds: string[]): Promise<Map<string, string>> {
    if (brandIds.length === 0) return new Map();

    const mappings = await this.prisma.teamBrand.findMany({
      where: { brandId: { in: brandIds } },
      select: { brandId: true, teamId: true },
    });

    return new Map(mappings.map((m) => [m.brandId, m.teamId]));
  }
}
