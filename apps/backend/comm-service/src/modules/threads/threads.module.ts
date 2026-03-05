import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';

@Module({
  imports: [CommSchemasModule],
  controllers: [ThreadsController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
