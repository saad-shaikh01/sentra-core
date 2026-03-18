import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { Public } from '../../common';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database: 'ok' | 'unreachable' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unreachable';
    }

    return {
      status: 'ok',
      service: 'hrms',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database,
      },
    };
  }
}
