/**
 * ThreadsModule — PM-BE-016
 *
 * Reusable conversation thread engine for project, stage, task, and approval discussions.
 */

import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';

@Module({
  controllers: [ThreadsController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
