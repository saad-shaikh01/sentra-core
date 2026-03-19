import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailClientModule } from '@sentra-core/mail-client';
import { PermissionsGuard, PermissionsService } from '../../common';
import { StorageModule } from '../../common/storage/storage.module';
import { IamModule } from '../iam';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { AdminSessionsController } from './admin-sessions.controller';
import { JwtStrategy, JwtRefreshStrategy } from './strategies';
import { AccessTokenGuard, RefreshTokenGuard, RolesGuard, AppAccessGuard } from './guards';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: 900,
        },
      }),
    }),
    MailClientModule,
    IamModule,
    StorageModule,
  ],
  controllers: [AuthController, AdminSessionsController],
  providers: [
    AuthService,
    SessionsService,
    JwtStrategy,
    JwtRefreshStrategy,
    AccessTokenGuard,
    RefreshTokenGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    AppAccessGuard,
  ],
  exports: [
    AuthService,
    AccessTokenGuard,
    PermissionsService,
    PermissionsGuard,
    RolesGuard,
    AppAccessGuard,
  ],
})
export class AuthModule {}
