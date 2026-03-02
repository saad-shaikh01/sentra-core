import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';

/**
 * Health endpoint: GET /api/pm/health
 *
 * Checks:
 * - Service is alive
 * - Postgres connection is reachable (PM domain DB)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let dbStatus: 'ok' | 'unreachable' = 'ok';

    try {
      // Lightweight ping — reads nothing from business tables
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unreachable';
    }

    return {
      status: 'ok',
      service: 'pm-service',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }
}
