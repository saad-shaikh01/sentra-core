import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { HrmsCacheModule } from '../common/cache/hrms-cache.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { JwtContextMiddleware } from '../common/middleware/jwt-context.middleware';
import { RequestLoggingMiddleware } from '../common/middleware/request-logging.middleware';
import { PermissionsService } from '../common/services/permissions.service';
import { EmployeesModule } from '../modules/employees/employees.module';
import { HealthModule } from '../modules/health/health.module';
import { InvitationsModule } from '../modules/invitations/invitations.module';
import { AccessManagementModule } from '../modules/access-management/access-management.module';
import { TeamsModule } from '../modules/teams/teams.module';
import { DepartmentsModule } from '../modules/departments/departments.module';

function resolveEnvFiles(): string[] {
  const explicitEnvFile = process.env.ENV_FILE?.trim();
  if (explicitEnvFile) {
    return [explicitEnvFile, '.env'];
  }

  const nodeEnv = process.env.NODE_ENV?.trim();
  return nodeEnv ? [`.env.${nodeEnv}`, '.env'] : ['.env'];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFiles(),
    }),
    PrismaClientModule,
    HrmsCacheModule,
    HealthModule,
    EmployeesModule,
    InvitationsModule,
    AccessManagementModule,
    TeamsModule,
    DepartmentsModule,
  ],
  providers: [
    PermissionsService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OrgContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(JwtContextMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
  }
}
