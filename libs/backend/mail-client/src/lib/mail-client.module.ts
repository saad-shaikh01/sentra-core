import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailClientService } from './mail-client.service';

@Module({
  imports: [ConfigModule],
  providers: [MailClientService],
  exports: [MailClientService],
})
export class MailClientModule {}
