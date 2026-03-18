import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { MailClientModule } from '@sentra-core/mail-client';
import { AuthModule, AccessTokenGuard, RolesGuard, AppAccessGuard } from '../modules/auth';
import { UsersModule } from '../modules/users';
import { OrganizationModule } from '../modules/organization';
import { InvitationModule } from '../modules/invitation';
import { BrandsModule } from '../modules/brands';
import { LeadsModule } from '../modules/leads';
import { ClientsModule } from '../modules/clients';
import { SalesModule } from '../modules/sales';
import { InvoicesModule } from '../modules/invoices';
import { AuthorizeNetModule } from '../modules/authorize-net';
import { IamModule } from '../modules/iam';
import { PermissionsGuard, SentraCacheModule } from '../common';
import { InternalContactsModule } from '../modules/internal-contacts/internal-contacts.module';
import { TeamsModule } from '../modules/teams';
import { PackagesModule } from '../modules/packages';
import { SearchModule } from '../modules/search';
import { AnalyticsModule } from '../modules/analytics';
import { LeadIntegrationsModule } from '../modules/lead-integrations';
import { PublicPaymentsModule } from '../modules/public-payments/public-payments.module';
import { WebhooksModule } from '../modules/webhooks/webhooks.module';
import { RbacModule } from '../modules/rbac';

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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
    SentraCacheModule,
    PrismaClientModule,
    MailClientModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    InvitationModule,
    BrandsModule,
    LeadsModule,
    ClientsModule,
    AuthorizeNetModule,
    SalesModule,
    InvoicesModule,
    IamModule,
    InternalContactsModule,
    TeamsModule,
    PackagesModule,
    SearchModule,
    AnalyticsModule,
    LeadIntegrationsModule,
    PublicPaymentsModule,
    WebhooksModule,
    RbacModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AppAccessGuard,
    },
  ],
})
export class AppModule {}
