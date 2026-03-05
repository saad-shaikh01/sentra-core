import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalContactsController } from './internal-contacts.controller';
import { InternalContactsService } from './internal-contacts.service';
import { InternalServiceGuard } from './guards/internal-service.guard';

@Module({
  imports: [ConfigModule],
  controllers: [InternalContactsController],
  providers: [InternalContactsService, InternalServiceGuard],
})
export class InternalContactsModule {}
