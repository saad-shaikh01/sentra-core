import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailClientModule } from '@sentra-core/mail-client';
import { InvitationController, InvitationAuthController } from './invitation.controller';
import { InvitationService } from './invitation.service';

@Module({
  imports: [
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
  ],
  controllers: [InvitationController, InvitationAuthController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
