/**
 * ThreadsModule — PM-BE-016
 *
 * Reusable conversation thread engine for project, stage, task, and approval discussions.
 * Includes WebSocket gateway for real-time message delivery.
 */

import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { ThreadsGateway } from './threads.gateway';

@Module({
  controllers: [ThreadsController],
  providers: [ThreadsService, ThreadsGateway],
  exports: [ThreadsService, ThreadsGateway],
})
export class ThreadsModule {}
