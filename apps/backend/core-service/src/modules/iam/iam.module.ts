import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailClientModule } from '@sentra-core/mail-client';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  imports: [ConfigModule, MailClientModule],
  controllers: [IamController],
  providers: [IamService],
  exports: [IamService],
})
export class IamModule {}
