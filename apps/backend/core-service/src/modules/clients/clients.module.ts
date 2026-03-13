import { Module } from '@nestjs/common';
import { MailClientModule } from '@sentra-core/mail-client';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [MailClientModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
