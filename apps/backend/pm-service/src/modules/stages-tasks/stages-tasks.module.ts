/**
 * StagesTasksModule — PM-BE-010, PM-BE-011, PM-BE-012
 *
 * Provides:
 *  - StagesController  / StagesService   (stage lifecycle operations)
 *  - TasksController   / TasksService    (task CRUD and assignment)
 *  - WorklogsService                     (worklog + my-tasks query)
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PmCacheModule } from '../../common/cache/pm-cache.module';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WorklogsService } from './worklogs.service';
import { NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
// PmEventsService is provided by the global PmEventsModule (imported in AppModule)

@Module({
  imports: [
    PmCacheModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [StagesController, TasksController],
  providers: [StagesService, TasksService, WorklogsService],
  exports: [StagesService, TasksService, WorklogsService],
})
export class StagesTasksModule {}
