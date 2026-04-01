import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InternalContactsClient } from '../../common/http/internal-contacts.client';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ContactsController],
  providers: [InternalContactsClient],
})
export class ContactsModule {}
