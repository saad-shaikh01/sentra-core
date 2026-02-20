import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { MailClientModule } from '@sentra-core/mail-client';
import { AuthModule, AccessTokenGuard, RolesGuard } from '../modules/auth';
import { UsersModule } from '../modules/users';
import { OrganizationModule } from '../modules/organization';
import { InvitationModule } from '../modules/invitation';
import { BrandsModule } from '../modules/brands';
import { LeadsModule } from '../modules/leads';
import { ClientsModule } from '../modules/clients';
import { SalesModule } from '../modules/sales';
import { InvoicesModule } from '../modules/invoices';
import { AuthorizeNetModule } from '../modules/authorize-net';
import { SentraCacheModule } from '../common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
