import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { InternalContactsClient } from '../../common/http/internal-contacts.client';
import { EntityLinksController } from './entity-links.controller';
import { EntityLinksService } from './entity-links.service';

@Module({
  imports: [CommSchemasModule, HttpModule, ConfigModule],
  controllers: [EntityLinksController],
  providers: [EntityLinksService, InternalContactsClient],
  exports: [EntityLinksService],
})
export class EntityLinksModule {}
